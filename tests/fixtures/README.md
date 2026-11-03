# Classical vision test images

`box.png` and `box-in-scene.png` come from OpenCV 4.12.0 sample data:

- https://github.com/opencv/opencv/blob/4.12.0/samples/data/box.png
- https://github.com/opencv/opencv/blob/4.12.0/samples/data/box_in_scene.png

OpenCV authors/contributors; Apache 2.0 licence included in `OPENCV-LICENSE.txt`.
These are photographs of a textured planar object used to test viewpoint matching,
not training data or evidence that the program semantically recognises all foods.
The application does not include OpenCV as a runtime dependency; the vision engine
is implemented in this repository. Browser food-label fixtures are generated in tests.
