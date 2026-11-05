// Browser-only entry: esbuild resolves the browser export, never native Node bindings.
export {env,AutoProcessor,AutoModelForZeroShotObjectDetection,RawImage} from '@huggingface/transformers';
export {InferenceSession,Tensor as OrtTensor,env as ortEnv} from 'onnxruntime-web/webgpu';
