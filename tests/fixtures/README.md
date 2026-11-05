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

`grocery-bananas.jpg`, `grocery-tomatoes.jpg` and `grocery-milk.jpg` are the natural smartphone samples Banana, Vine-Tomato and Arla-Standard-Milk from Marcus Klasson's GroceryStoreDataset, commit fc80ba90f803d79d0383df52c5a4ac5de99ff6fc:
https://github.com/marcusklasson/GroceryStoreDataset/tree/fc80ba90f803d79d0383df52c5a4ac5de99ff6fc/sample_images/natural
Repository MIT licence in `GROCERY-LICENSE.txt`. Klasson, Zhang and Kjellström, “A Hierarchical Grocery Store Image Dataset with Visual and Semantic Labels”, WACV 2019. These publicly published natural photos are test inputs only, never references or training data used by this application.

`book.png` is OpenCV 4.12.0 `samples/data/box.png`, under the same Apache 2.0 licence as fruits. It is a non-food negative input.
