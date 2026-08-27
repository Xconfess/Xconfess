# Pull Request: Chunked Export Packaging for Large Account Histories

## Summary
This PR implements a chunked packaging system for user data exports. It addresses the issue of memory spikes and worker instability when processing large account histories by switching from an in-memory buffering strategy to a stream-based chunking strategy.

## Changes
- **Database Model**:
  - Added `ExportChunk` entity to store individual 10MB file segments.
  - Updated `ExportRequest` with metadata for tracking multi-part bundles (isChunked, chunkCount, totalSize, combinedChecksum).
- **Export Processing**:
  - Refactored `ExportProcessor` to use `archiver` piped into a custom `Writable` stream.
  - ZIP data is now saved to the database in 10MB increments, keeping worker memory usage constant and low.
- **Service & Controller**:
  - Updated `DataExportService` to support retrieving specific chunks and generating signed URLs for them.
  - Enhanced `DataExportController` to provide metadata for chunked exports and handle partial-segment downloads.
- **Verification**:
  - Added unit tests for the signed URL generation and chunk retrieval logic in `DataExportService`.
  - Added unit tests for the streaming and chunk saving logic in `ExportProcessor`.

## Impact
- Large account exports (e.g., >100MB) no longer cause OOM errors in backend workers.
- Users can now download large histories in manageable segments with integrity validation across all parts.

## Issue
#432
