Synthetic fixtures for the upload and media tests, with no guest data.

- JPEG, PNG, WebP and HEIC: a solid 64 x 48 colour swatch generated with Pillow and pillow-heif.
- MP4 and MOV: 2 seconds of a 160 x 120 FFmpeg test pattern with yuv420p and faststart. The MP4 is H.264; the MOV is HEVC with the `hvc1` tag.

The encoded files are checked in so the tests do not require encoders or network access.
