import { SupplyTotal } from "./types";
import { KVStore } from "@keplr-wallet/common";
import {
  ObservableChainQuery,
  ObservableChainQueryMap,
} from "../../chain-query";
import { ChainGetter } from "../../../common";

export class ObservableChainQuerySupplyTotal extends ObservableChainQuery<SupplyTotal> {
  constructor(
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter,
    denom: string
  ) {
    super(
      kvStore,
      chainId,
      chainGetter,
      `/cosmos/bank/v1beta1/supply/${denom}`
    );
  }
}

export class ObservableQuerySupplyTotal extends ObservableChainQueryMap<SupplyTotal> {
  constructor(kvStore: KVStore, chainId: string, chainGetter: ChainGetter) {
    super(kvStore, chainId, chainGetter, (denom: string) => {
      return new ObservableChainQuerySupplyTotal(
        this.kvStore,
        this.chainId,
        this.chainGetter,
        denom
      );
    });
  }

  getQueryDenom(denom: string): ObservableChainQuerySupplyTotal {
    return this.get(denom);
  }

  // Somewhat strange. Only used for umee.
  getQueryDenomByQueryString(denom: string): ObservableChainQuerySupplyTotal {
    return this.get(`by_denom?denom=${denom}`);
  }

  getQueryStakeDenom(): ObservableChainQuerySupplyTotal {
    const chainInfo = this.chainGetter.getChain(this.chainId);
    return this.get(chainInfo.stakeCurrency.coinMinimalDenom);
  }
}
