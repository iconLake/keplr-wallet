import {
  IFeeConfig,
  IPsbtSimulator,
  ITxSizeConfig,
  UIProperties,
} from "./types";
import {
  action,
  autorun,
  computed,
  IReactionDisposer,
  makeObservable,
  observable,
  runInAction,
} from "mobx";
import { useEffect, useState } from "react";
import { KVStore } from "@keplr-wallet/common";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { TxChainSetter } from "./chain";
import { ChainGetter } from "@keplr-wallet/stores";
import { isSimpleFetchError } from "@keplr-wallet/simple-fetch";
import { Psbt } from "bitcoinjs-lib";
import { RemainderStatus } from "@keplr-wallet/stores-bitcoin";
import { UnableToFindProperUtxosError } from "./errors";

type PsbtSimulate = () => Promise<{
  psbtHex: string;
  txSize: {
    txVBytes: number;
    txBytes: number;
    txWeight: number;
  };
  remainderStatus: RemainderStatus;
  remainderValue: string;
}>;
export type SimulatePsbtFn = () => PsbtSimulate;

class PsbtSimulatorState {
  @observable
  protected _isInitialized: boolean = false;

  // If the initialPsbtHex is null, it means that there is no value stored or being loaded.
  @observable.ref
  protected _initialPsbtHex: string | null = null;
  @observable
  protected _initialTxSize: number | null = null;
  @observable
  protected _initialRemainderValue: string | null = null;

  @observable
  protected _recentPsbtHex: string | null = null;
  @observable
  protected _recentTxSize: number | null = null;
  @observable
  protected _recentRemainderValue: string | null = null;

  @observable
  protected _psbtSimulate: PsbtSimulate | undefined = undefined;
  @observable.ref
  protected _error: Error | undefined = undefined;

  constructor() {
    makeObservable(this);
  }

  @action
  setIsInitialized(value: boolean) {
    this._isInitialized = value;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  @action
  setInitialPsbtHex(value: string) {
    this._initialPsbtHex = value;
  }

  @action
  setInitialTxSize(value: number | string) {
    if (typeof value === "string") {
      value = parseInt(value);
    }

    this._initialTxSize = value;
  }

  @action
  setInitialRemainderValue(value: string) {
    this._initialRemainderValue = value;
  }

  get initialPsbtHex(): string | null {
    return this._initialPsbtHex;
  }

  get initialTxSize(): number | null {
    return this._initialTxSize;
  }

  get initialRemainderValue(): string | null {
    return this._initialRemainderValue;
  }

  @action
  refreshPsbtSimulate(value: PsbtSimulate) {
    this._psbtSimulate = value;
  }

  get psbtSimulate(): PsbtSimulate | undefined {
    return this._psbtSimulate;
  }

  @action
  setRecentPsbtHex(value: string) {
    this._recentPsbtHex = value;
  }

  @action
  setRecentRemainderValue(value: string) {
    this._recentRemainderValue = value;
  }

  get recentPsbtHex(): string | null {
    return this._recentPsbtHex;
  }

  get recentRemainderValue(): string | null {
    return this._recentRemainderValue;
  }

  @action
  setRecentTxSize(value: number) {
    this._recentTxSize = value;
  }

  get recentTxSize(): number | null {
    return this._recentTxSize;
  }

  @action
  setError(error: Error | undefined) {
    this._error = error;
  }

  get error(): Error | undefined {
    return this._error;
  }
}

export class PsbtSimulator extends TxChainSetter implements IPsbtSimulator {
  @observable
  protected _key: string;

  @observable
  protected _enabled: boolean = false;

  @observable
  protected _forceDisabled: boolean = false;
  @observable
  protected _forceDisableReason: Error | undefined = undefined;

  @observable
  protected _isSimulating: boolean = false;

  // Key is the store key (probably, ${chainIdentifier}/${key})
  @observable.shallow
  protected _stateMap: Map<string, PsbtSimulatorState> = new Map();

  protected _debounceTimeoutId: NodeJS.Timeout | null = null;
  protected readonly _debounceMs: number = 300;

  protected _disposers: IReactionDisposer[] = [];

  constructor(
    protected kvStore: KVStore,
    chainGetter: ChainGetter,
    initialChainId: string,
    protected readonly txSizeConfig: ITxSizeConfig,
    protected readonly feeConfig: IFeeConfig,
    protected readonly initialKey: string,
    protected simulatePsbtFn: SimulatePsbtFn
  ) {
    super(chainGetter, initialChainId);

    this._key = initialKey;

    makeObservable(this);

    this.init();
  }

  setKVStore(kvStore: KVStore) {
    this.kvStore = kvStore;
  }

  get key(): string {
    return this._key;
  }

  @action
  setKey(value: string) {
    this._key = value;
  }

  get isSimulating(): boolean {
    return this._isSimulating;
  }

  setSimulatePsbtFn(simulatePsbtFn: SimulatePsbtFn) {
    this.simulatePsbtFn = simulatePsbtFn;
  }

  get enabled(): boolean {
    if (this._forceDisabled) {
      return false;
    }

    return this._enabled;
  }

  @action
  setEnabled(value: boolean) {
    if (this._forceDisabled && value) {
      console.log(
        "Psbt simulator is disabled by force. You can not enable the Psbt simulator"
      );
      return;
    }

    this._enabled = value;
  }

  get forceDisabled(): boolean {
    return this._forceDisabled;
  }

  get forceDisableReason(): Error | undefined {
    return this._forceDisableReason;
  }

  @action
  forceDisable(valueOrReason: boolean | Error) {
    if (!valueOrReason) {
      this._forceDisabled = false;
      this._forceDisableReason = undefined;
    } else {
      if (this.enabled) {
        this.setEnabled(false);
      }
      this._forceDisabled = true;
      if (typeof valueOrReason !== "boolean") {
        this._forceDisableReason = valueOrReason;
      }
    }
  }

  get error(): Error | undefined {
    const key = this.storeKey;
    const state = this.getState(key);
    return state.error;
  }

  get psbtHex(): string | null {
    const key = this.storeKey;
    const state = this.getState(key);

    if (state.recentPsbtHex != null) {
      return state.recentPsbtHex;
    }

    return state.initialPsbtHex;
  }

  get txSize(): number | null {
    const key = this.storeKey;
    const state = this.getState(key);

    if (state.recentTxSize != null) {
      return state.recentTxSize;
    }

    return state.initialTxSize;
  }

  get remainderValue(): string | null {
    const key = this.storeKey;
    const state = this.getState(key);
    return state.recentRemainderValue;
  }

  protected init() {
    // init psbt if it exists
    this._disposers.push(
      autorun(() => {
        if (!this.enabled) {
          return;
        }

        const key = this.storeKey;
        const state = this.getState(key);

        this.kvStore.get<string>(key).then((saved) => {
          if (saved) {
            try {
              const [psbtHex, txSize, remainderValue] = saved.split("/");

              Psbt.fromHex(psbtHex); // validate the psbt hex
              state.setInitialPsbtHex(psbtHex);
              state.setInitialTxSize(txSize);
              state.setInitialRemainderValue(remainderValue);
            } catch (e) {
              // initial psbt is not critical,
              // just log the error and delete the psbt from the store.
              console.warn(e);
              this.kvStore.set(key, "");
            }
          }

          state.setIsInitialized(true);
        });
      })
    );

    // autorun is intentionally split.
    this._disposers.push(
      autorun(() => {
        if (!this.enabled) {
          return;
        }

        try {
          const key = this.storeKey;
          const state = this.getState(key);

          if (!state.isInitialized) {
            return;
          }

          const psbtSimulate = this.simulatePsbtFn();

          runInAction(() => {
            if (state.recentPsbtHex == null || state.error != null) {
              state.refreshPsbtSimulate(psbtSimulate);
            }
          });
        } catch (e) {
          console.log(e);
          return;
        }
      })
    );

    this._disposers.push(
      autorun(() => {
        const key = this.storeKey;
        const state = this.getState(key);

        if (!state.psbtSimulate) {
          return;
        }

        if (this._debounceTimeoutId) {
          clearTimeout(this._debounceTimeoutId);
        }

        const promise = state.psbtSimulate();

        this._debounceTimeoutId = setTimeout(() => {
          runInAction(() => {
            this._isSimulating = true;
          });

          promise
            .then(({ psbtHex, txSize, remainderValue, remainderStatus }) => {
              if (
                state.recentPsbtHex === null ||
                state.recentTxSize === null ||
                state.recentTxSize > txSize.txVBytes
              ) {
                state.setRecentPsbtHex(psbtHex);
                state.setRecentTxSize(txSize.txVBytes);

                if (remainderStatus === RemainderStatus.AddedToFee) {
                  state.setRecentRemainderValue(remainderValue);
                } else {
                  // 잔돈으로 처리되는 경우 0으로 설정
                  state.setRecentRemainderValue("0");
                }
              }

              state.setError(undefined);

              this.kvStore
                .set(
                  key,
                  `${psbtHex}/${txSize.txVBytes}/${
                    remainderStatus === RemainderStatus.AddedToFee
                      ? remainderValue
                      : "0"
                  }`
                )
                .catch((e) => {
                  console.log(e);
                });
            })
            .catch((e) => {
              console.log("psbt simulate error", e);
              if (isSimpleFetchError(e) && e.response) {
                let message = "";
                const contentType: string = e.response.headers
                  ? e.response.headers.get("content-type") || ""
                  : "";
                // Try to figure out the message from the response.
                // If the contentType in the header is specified, try to use the message from the response.
                if (
                  contentType.startsWith("text/plain") &&
                  typeof e.response.data === "string"
                ) {
                  message = e.response.data;
                }
                // If the response is an object and "message" field exists, it is used as a message.
                if (
                  contentType.startsWith("application/json") &&
                  e.response.data?.message &&
                  typeof e.response.data?.message === "string"
                ) {
                  message = e.response.data.message;
                }

                if (message !== "") {
                  state.setError(new Error(message));
                  return;
                }
              }

              state.setError(e);
            })
            .finally(() => {
              runInAction(() => {
                this._isSimulating = false;
              });
            });
        }, this._debounceMs);
      })
    );

    this._disposers.push(
      autorun(() => {
        if (this.enabled && this.txSize != null) {
          this.txSizeConfig.setValue(this.txSize);
        }
      })
    );

    this._disposers.push(
      autorun(() => {
        if (this.enabled && this.remainderValue != null) {
          this.feeConfig.setRemainderValue(this.remainderValue);
        }
      })
    );
  }

  dispose() {
    for (const disposer of this._disposers) {
      disposer();
    }
  }

  get uiProperties(): UIProperties {
    return {
      error: (() => {
        if (this.error) {
          if (this.error instanceof UnableToFindProperUtxosError) {
            return this.error;
          }
        }
      })(),
      warning: (() => {
        if (this.forceDisableReason) {
          return this.forceDisableReason;
        }

        if (this.error) {
          if (!(this.error instanceof UnableToFindProperUtxosError)) {
            return this.error;
          }
        }
      })(),
      loadingState: (() => {
        if (!this.enabled) {
          return;
        }

        if (this.isSimulating) {
          // If there is no saved result of the last simulation, user interaction is blocked.
          return this.psbtHex == null || this.txSize == null
            ? "loading-block"
            : "loading";
        }
      })(),
    };
  }

  protected getState(key: string): PsbtSimulatorState {
    if (!this._stateMap.has(key)) {
      runInAction(() => {
        this._stateMap.set(key, new PsbtSimulatorState());
      });
    }

    return this._stateMap.get(key)!;
  }

  @computed
  protected get storeKey(): string {
    const chainIdentifier = ChainIdHelper.parse(this.chainId);
    const psbt = "TODO";
    // TODO
    // const fees = this.feeConfig
    //   .toStdFee()
    //   .amount.map((coin) => coin.denom)
    //   .join("/");
    return `${chainIdentifier.identifier}/${psbt}/${this.key}`;
  }
}

// CONTRACT: Use with `observer`
export const usePsbtSimulator = (
  kvStore: KVStore,
  chainGetter: ChainGetter,
  chainId: string,
  txSizeConfig: ITxSizeConfig,
  feeConfig: IFeeConfig,
  key: string,
  simulatePsbtFn: SimulatePsbtFn,
  initialDisabled?: boolean
) => {
  const [psbtSimulator] = useState(() => {
    const psbtSimulator = new PsbtSimulator(
      kvStore,
      chainGetter,
      chainId,
      txSizeConfig,
      feeConfig,
      key,
      simulatePsbtFn
    );
    if (initialDisabled) {
      psbtSimulator.setEnabled(false);
    } else {
      psbtSimulator.setEnabled(true);
    }

    return psbtSimulator;
  });
  psbtSimulator.setKVStore(kvStore);
  psbtSimulator.setChain(chainId);
  psbtSimulator.setKey(key);
  psbtSimulator.setSimulatePsbtFn(simulatePsbtFn);

  useEffect(() => {
    return () => {
      psbtSimulator.dispose();
    };
  }, [psbtSimulator]);

  return psbtSimulator;
};
