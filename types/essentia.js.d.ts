declare module "essentia.js" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Essentia: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const EssentiaWASM: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const EssentiaModel: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const EssentiaPlot: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const EssentiaExtractor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const defaultExport: any;
  export default defaultExport;
}

declare module "essentia.js/dist/essentia.js-model.es.js" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const EssentiaTFInputExtractor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const TensorflowMusiCNN: any;
}
