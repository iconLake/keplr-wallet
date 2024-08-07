export interface InteractionWaitingData<T = unknown> {
  id: string;
  type: string;
  isInternal: boolean;
  data: T;
  windowId: number | undefined;
  uri: string;
}
