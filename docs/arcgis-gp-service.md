# ArcGIS GP service: ProjectUploadPackage

For GIS administrators who publish or update the geoprocessing service the app calls. The script is [`deployment/ProjectUploadPackage.py`](../deployment/ProjectUploadPackage.py).

The service accepts one ZIP upload and transforms the DrukRef03 datasets in it (EPSG:5266) to DrukRef23 (WKID 11341). It always uses the approved NTv2 custom geographic transformation `DrukRef03_To_DrukRef23_NTv2.gtf`; **it never chooses a transformation automatically**. It returns the same output formats plus `project-manifest.json`. Shapefiles, GeoPackages and File Geodatabases inside the ZIP are supported.

Datasets without a defined DrukRef03 (EPSG:5266) coordinate system, or in any other coordinate system, are rejected.

## Package layout

The browser creates a ZIP like this:

```text
project-upload.zip
  roads/
    roads.shp
    roads.shx
    roads.dbf
    roads.prj
  parcels.gpkg
  cadastre.gdb/
  project-manifest.json
```

A Shapefile is accepted only when its `.shp`, `.shx`, `.dbf` and `.prj` files are all present.

## Publish from ArcGIS Pro

Before publishing, confirm that `DrukRef03_To_DrukRef23_NTv2.gtf` and its NTv2 `.gsb` grid are installed on every ArcGIS Server machine and readable by the ArcGIS Server service account. The custom transformation must appear in ArcGIS Pro's geographic transformation list for a DrukRef03-to-DrukRef23 conversion.

1. Copy `ProjectUploadPackage.py` to a location the ArcGIS Server account can read.
2. In ArcGIS Pro, open a project in the same environment the server uses.
3. Create a toolbox and add the Python file as a script tool named `ProjectUploadPackage`.
4. Configure the script tool parameters in exactly this order:
   - `in_package`: **File**, Input, Required, filter `zip`.
   - `out_package`: **File**, Output, **Derived**, filter `zip`. The script writes it to the ArcGIS scratch folder.
5. Run the tool locally with `deployment/data/drukref03-test-upload.zip`. Confirm the output ZIP contains projected data and `project-manifest.json`.
6. Confirm the messages show `Processing dataset n of m`, followed by either `<dataset> successfully transformed.` or a `<dataset> failed to transform: <reason>` warning. The app parses these messages.
7. Right-click the tool and choose **Share As Web Tool**.
8. Select the `cadastral.systems.gov.bt` server connection and the folder `project`.
9. Set execution to **Asynchronous** and make the result a downloadable file.
10. Analyze, resolve all errors, and publish as `ProjectUploadPackage`.
11. In ArcGIS Server Manager, enable **Uploads** for the service. Allow the app's ArcGIS account (see [configuration.md](configuration.md)) to access it.

## Verify

Signed in to the ArcGIS Server Services Directory, open:

```text
https://cadastral.systems.gov.bt/server/rest/services/project/ProjectUploadPackage/GPServer/ProjectUploadPackage?f=pjson
```

`in_package` must be `GPDataFile`, the output a derived downloadable file, and `executionType` `esriExecutionTypeAsynchronous`. Then run `pnpm test:live` ([development.md](development.md#live-test)), which submits the test package end to end with the app's account.

## REST calls the app makes

The app server makes these calls ([architecture.md](architecture.md)) with a token in the `X-Esri-Authorization` header:

```text
POST …/GPServer/uploads/upload                           file=<zip>, f=json            → item.itemID
POST …/GPServer/ProjectUploadPackage/submitJob           in_package={"itemID":"…"}      → jobId
GET  …/GPServer/ProjectUploadPackage/jobs/<jobId>?f=json&returnMessages=true           → jobStatus, messages
GET  …/GPServer/ProjectUploadPackage/jobs/<jobId>/results/out_package?f=json           → value.url (downloaded by the app)
```

## Server configuration

- The ArcGIS Server account can read the script and run the ArcGIS Pro Python environment.
- It can write to the ArcGIS Server jobs and scratch directories.
- Upload size, job time-out and result retention are set for the expected package sizes (see the limits in [deployment.md](deployment.md)).
- ArcGIS Coordinate Systems Data is installed as your ArcGIS Server version requires.
- The `.gtf` and `.gsb` files are on every machine. Restart the service after installing them.
- Test with a complete DrukRef03 Shapefile ZIP, a GeoPackage and a FileGDB ZIP, and confirm that a non-EPSG:5266 dataset is rejected.
- Keep the service secured (token security). The app is the only intended client.

## Implementation notes

The script inspects each dataset and requires DrukRef03 (EPSG:5266). It checks that the named custom transformation is available and applies it explicitly to produce DrukRef23 (WKID 11341).

- A missing, unreadable or non-DrukRef03 coordinate system is reported as a source-data problem.
- The manifest records the source and target WKIDs, the `.gtf` name, the result for each dataset, and a success/failure summary.
- A package is created only when at least one dataset succeeds. Otherwise the job fails with a readable explanation and no download is offered.
- The script ignores `project-manifest.json` as input and rejects unsafe or oversized archives (more than 10,000 entries or 5 GB uncompressed, path traversal, symbolic links). It processes FileGDB feature datasets.
- GeoJSON and generic JSON are not accepted. A FileGDB must be inside the ZIP, because it is a directory, not a single file.
