// Browser-only entry: esbuild resolves the browser export, never native Node bindings.
export {env,AutoTokenizer,AutoProcessor,AutoModelForZeroShotObjectDetection,RawImage} from '@huggingface/transformers';
export {InferenceSession,Tensor as OrtTensor,env as ortEnv} from 'onnxruntime-web/webgpu';
