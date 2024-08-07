import {
  MessageRequester,
  Message,
  Result,
  KeplrError,
  JSONUint8Array,
  EthereumProviderRpcError,
} from "@keplr-wallet/router";
import { MockRouter } from "../router";

export class MockMessageRequester implements MessageRequester {
  constructor(protected readonly id: string, protected readonly url: string) {}

  async sendMessage<M extends Message<unknown>>(
    port: string,
    msg: M
  ): Promise<M extends Message<infer R> ? R : never> {
    msg.validateBasic();

    // Set message's origin.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    msg["origin"] = new URL(this.url).origin;

    const result: Result = JSONUint8Array.unwrap(
      await new Promise((resolve) => {
        MockRouter.eventEmitter.emit("message", {
          message: {
            port,
            type: msg.type(),
            msg: JSONUint8Array.wrap(msg),
          },
          sender: {
            id: this.id,
            url: this.url,
            resolver: resolve,
          },
        });
      })
    );

    if (!result) {
      throw new Error("Null result");
    }

    if (result.error) {
      if (typeof result.error === "string") {
        throw new Error(result.error);
      } else {
        if ("module" in result.error) {
          if (typeof result.error.module === "string") {
            throw new KeplrError(
              result.error.module,
              result.error.code,
              result.error.message
            );
          }
        } else {
          throw new EthereumProviderRpcError(
            result.error.code,
            result.error.message,
            result.error.data
          );
        }
      }
    }

    return result.return;
  }
}
