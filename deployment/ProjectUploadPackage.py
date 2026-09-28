"""ArcGIS Pro script tool: ProjectUploadPackage.

Converts DrukRef03 datasets (EPSG:5266) to DrukRef23 (WKID 11341)
with the approved NTv2 custom geographic transformation.

Parameters:
  0 Input package (GPDataFile)
  1 Output package (GPDataFile)
"""
import json
import os
import shutil
import tempfile
import zipfile
import arcpy

SOURCE_WKID = 5266
TARGET_WKID = 11341
CUSTOM_TRANSFORMATION_FILE = "DrukRef03_To_DrukRef23_NTv2.gtf"
CUSTOM_TRANSFORMATION_NAME = os.path.splitext(CUSTOM_TRANSFORMATION_FILE)[0]
MAX_ARCHIVE_MEMBERS = 10000
MAX_ARCHIVE_BYTES = 5 * 1024 * 1024 * 1024


def safe_extract(archive, destination):
    root = os.path.realpath(destination)
    members = archive.infolist()
    if len(members) > MAX_ARCHIVE_MEMBERS:
        raise RuntimeError("The upload contains too many archive entries.")
    total_size = sum(member.file_size for member in members)
    if total_size > MAX_ARCHIVE_BYTES:
        raise RuntimeError("The uncompressed upload is too large.")
    for member in members:
        target = os.path.realpath(os.path.join(destination, member.filename))
        if not target.startswith(root + os.sep):
            raise RuntimeError("The upload contains an unsafe archive path.")
        if member.is_dir():
            continue
        unix_mode = (member.external_attr >> 16) & 0o170000
        if unix_mode == 0o120000:
            raise RuntimeError("The upload contains a symbolic link.")
    archive.extractall(destination)


def find_datasets(root):
    datasets = []
    for current, directories, files in os.walk(root):
        directories[:] = [name for name in directories if not name.startswith("_")]
        if current.lower().endswith(".gdb"):
            datasets.append(("gdb", current))
            directories[:] = []
            continue
        for name in files:
            lower = name.lower()
            path = os.path.join(current, name)
            if lower.endswith(".shp") or lower.endswith(".gpkg"):
                datasets.append((lower.rsplit(".", 1)[-1], path))
    return datasets


def source_reference(source_dataset):
    try:
        description = arcpy.Describe(source_dataset)
        spatial_reference = description.spatialReference
        source_code = spatial_reference.factoryCode if spatial_reference else 0
        source_name = spatial_reference.name if spatial_reference else "Unknown"
    except Exception:
        raise RuntimeError(
            "The source data cannot be confirmed as DrukRef03 (EPSG:{}), because its coordinate system is missing or unreadable. "
            "Define the source coordinate system as DrukRef03 and try again.".format(SOURCE_WKID)
        )
    if source_code != SOURCE_WKID:
        raise RuntimeError(
            "The source data is not DrukRef03 (EPSG:{}). It is defined as {} (WKID {}). "
            "Use data in DrukRef03 and try again.".format(
                SOURCE_WKID, source_name, source_code or "unknown"
            )
        )
    return spatial_reference, source_name, source_code


def custom_transformation(spatial_reference):
    target_sr = arcpy.SpatialReference(TARGET_WKID)
    available = arcpy.ListTransformations(spatial_reference, target_sr)
    if CUSTOM_TRANSFORMATION_NAME not in available:
        raise RuntimeError(
            "Required NTv2 transformation '{}' is unavailable. Verify that '{}' "
            "and its .gsb grid are installed for the ArcGIS Server service account.".format(
                CUSTOM_TRANSFORMATION_NAME, CUSTOM_TRANSFORMATION_FILE
            )
        )
    return target_sr, CUSTOM_TRANSFORMATION_NAME


def project_one(kind, source, output_root, workspace):
    base = os.path.splitext(os.path.basename(source))[0]
    source_dataset = source

    if kind == "shp":
        spatial_reference, source_name, source_code = source_reference(source_dataset)
        target_sr, transform = custom_transformation(spatial_reference)
        destination = os.path.join(output_root, base, base + "_DrukRef23.shp")
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        arcpy.management.Project(source_dataset, destination, target_sr, transform)
        output_name = os.path.dirname(destination)
    elif kind == "gpkg":
        spatial_reference, source_name, source_code = source_reference(source_dataset)
        target_sr, transform = custom_transformation(spatial_reference)
        output_name = os.path.join(output_root, base + "_DrukRef23.gpkg")
        arcpy.management.CreateSQLiteDatabase(output_name, "GEOPACKAGE")
        destination = os.path.join(output_name, base + "_DrukRef23")
        arcpy.management.Project(source_dataset, destination, target_sr, transform)
    elif kind == "gdb":
        output_name = os.path.join(output_root, os.path.splitext(os.path.basename(source))[0] + "_DrukRef23.gdb")
        previous_workspace = arcpy.env.workspace
        feature_classes = []
        projected_count = 0
        try:
            arcpy.env.workspace = source_dataset
            feature_datasets = arcpy.ListDatasets("", "Feature") or []
            for child in arcpy.ListFeatureClasses() or []:
                feature_classes.append((os.path.join(source_dataset, child), child, None))
            for feature_dataset in feature_datasets:
                source_dataset_path = os.path.join(source_dataset, feature_dataset)
                for child in arcpy.ListFeatureClasses(feature_dataset=feature_dataset) or []:
                    feature_classes.append((os.path.join(source_dataset_path, child), child, feature_dataset))
        finally:
            arcpy.env.workspace = previous_workspace
        if not feature_classes:
            raise RuntimeError("The File Geodatabase contains no feature classes.")
        source_name = None
        source_code = None
        target_sr = None
        transform = None
        for feature_class, _, _ in feature_classes:
            feature_sr, feature_name, feature_code = source_reference(feature_class)
            custom_transformation(feature_sr)
            if source_name is None:
                source_name = feature_name
                source_code = feature_code
                target_sr, transform = custom_transformation(feature_sr)
        arcpy.management.CreateFileGDB(output_root, os.path.basename(output_name))
        for feature_class, child, feature_dataset in feature_classes:
            if feature_dataset:
                destination_dataset = os.path.join(output_name, feature_dataset)
                if not arcpy.Exists(destination_dataset):
                    arcpy.management.CreateFeatureDataset(output_name, feature_dataset, target_sr)
                destination = os.path.join(destination_dataset, child)
            else:
                destination = os.path.join(output_name, child)
            arcpy.management.Project(feature_class, destination, target_sr, transform)
            projected_count += 1
    else:
        raise RuntimeError("Unsupported dataset format: {}".format(kind))

    return {"input": os.path.basename(source), "sourceProjection": source_name, "sourceWkid": source_code, "targetWkid": TARGET_WKID, "transformation": CUSTOM_TRANSFORMATION_FILE, "output": os.path.basename(output_name), "status": "succeeded"}


def main():
    input_package = arcpy.GetParameterAsText(0)
    output_package = arcpy.GetParameterAsText(1)
    workspace = tempfile.mkdtemp(prefix="project_upload_")
    if not output_package:
        output_package = os.path.join(arcpy.env.scratchFolder or workspace, "projected-output.zip")
    extract_root = os.path.join(workspace, "input")
    output_root = os.path.join(workspace, "output")
    os.makedirs(extract_root)
    os.makedirs(output_root)
    try:
        if not zipfile.is_zipfile(input_package):
            raise RuntimeError("Input must be a ZIP package.")
        with zipfile.ZipFile(input_package) as archive:
            safe_extract(archive, extract_root)
        datasets = find_datasets(extract_root)
        if not datasets:
            raise RuntimeError("No supported datasets were found in the upload package.")
        arcpy.SetProgressor("step", "Projecting datasets", 0, len(datasets), 1)
        manifest = {"sourceWkid": SOURCE_WKID, "targetWkid": TARGET_WKID, "transformation": CUSTOM_TRANSFORMATION_FILE, "datasets": [], "ignored": []}
        for index, (kind, source) in enumerate(datasets, 1):
            arcpy.SetProgressorLabel("Processing {} of {}: {}".format(index, len(datasets), os.path.basename(source)))
            arcpy.AddMessage("Processing dataset {} of {}: {}".format(index, len(datasets), os.path.basename(source)))
            try:
                result = project_one(kind, source, output_root, workspace)
                manifest["datasets"].append(result)
                arcpy.AddMessage("{} successfully transformed.".format(result["input"]))
            except Exception as error:
                arcpy.AddWarning("{} failed to transform: {}".format(os.path.basename(source), error))
                manifest["datasets"].append({"input": os.path.basename(source), "status": "failed", "error": str(error)})
            arcpy.SetProgressorPosition(index)
        successful_count = sum(1 for dataset in manifest["datasets"] if dataset["status"] == "succeeded")
        failed_count = len(manifest["datasets"]) - successful_count
        manifest["summary"] = {"successful": successful_count, "failed": failed_count}
        if successful_count == 0:
            raise RuntimeError(
                "No datasets could be transformed. All {} dataset(s) failed. "
                "Each dataset must be defined as DrukRef03 (EPSG:{}). Read the failure messages above, correct the source data, and try again.".format(
                    failed_count, SOURCE_WKID
                )
            )
        with open(os.path.join(output_root, "project-manifest.json"), "w", encoding="utf-8") as stream:
            json.dump(manifest, stream, indent=2)
        os.makedirs(os.path.dirname(os.path.realpath(output_package)), exist_ok=True)
        if os.path.exists(output_package):
            os.remove(output_package)
        with zipfile.ZipFile(output_package, "w", zipfile.ZIP_DEFLATED) as archive:
            for current, _, files in os.walk(output_root):
                for name in files:
                    path = os.path.join(current, name)
                    archive.write(path, os.path.relpath(path, output_root))
        arcpy.SetParameterAsText(1, output_package)
        arcpy.AddMessage("Transformation completed: {} dataset(s) successfully transformed; {} failed.".format(successful_count, failed_count))
    finally:
        shutil.rmtree(workspace, ignore_errors=True)


if __name__ == "__main__":
    main()
