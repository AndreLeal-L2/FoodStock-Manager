# Public photo fixture and UI test boundary

`fruits.jpg` comes from OpenCV 4.12.0 sample data:
https://github.com/opencv/opencv/blob/4.12.0/samples/data/fruits.jpg

OpenCV authors/contributors; Apache 2.0 licence in `OPENCV-LICENSE.txt`.
It is an input to the real pre-trained model integration test, not a user reference,
training image or evidence of accuracy on every pantry scene.

`simulated-model-runtime.mjs` and `simulated-label-runtime.mjs` are test doubles served only by the UI test server.
It is never copied into the published application. Those UI tests validate review,
cancellation, offline drafts and stock/sync contracts; they do not validate semantic
model accuracy. `test:vision:real` uses the actual public weights separately.

`labels-browser.cjs` draws synthetic Portuguese labels in a canvas and runs the real OCR/WASM plus language weights. It checks the offline review flow, ingredient/absence examples, no quantity inference and zero external requests. These printed test labels are not reference registration or training data and do not prove accuracy on real packaging.
