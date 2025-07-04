import {
  HasMapStore,
  ObservableQuery,
  QuerySharedContext,
} from "@keplr-wallet/stores";
import { AssetsFromSourceResponse } from "./types";
import { simpleFetch } from "@keplr-wallet/simple-fetch";
import { computed, makeObservable } from "mobx";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import Joi from "joi";
import { InternalChainStore } from "../internal";

const Schema = Joi.object<AssetsFromSourceResponse>({
  dest_assets: Joi.object()
    .unknown(true)
    .pattern(
      Joi.string(),
      Joi.object({
        assets: Joi.array().items(
          Joi.object({
            denom: Joi.string(),
            chain_id: Joi.string(),
            origin_denom: Joi.string(),
            origin_chain_id: Joi.string(),
          }).unknown(true)
        ),
      }).unknown(true)
    ),
}).unknown(true);

export class ObservableQueryAssetsFromSourceInner extends ObservableQuery<AssetsFromSourceResponse> {
  constructor(
    sharedContext: QuerySharedContext,
    protected readonly chainStore: InternalChainStore,
    skipURL: string,
    public readonly chainId: string,
    public readonly denom: string
  ) {
    super(
      sharedContext,
      skipURL,
      `/v1/swap/assets_from_source?chain_id=${chainId.replace(
        "eip155:",
        ""
      )}&denom=${denom.replace("erc20:", "")}`
    );

    makeObservable(this);
  }

  @computed
  get assetsFromSource(): {
    [chainId: string]:
      | {
          assets: {
            denom: string;
            chainId: string;
            originDenom: string;
            originChainId: string;
          }[];
        }
      | undefined;
  } {
    if (
      !this.response ||
      !this.response.data ||
      !this.response.data.dest_assets
    ) {
      return {};
    }

    const result: {
      [chainId: string]: {
        assets: {
          denom: string;
          chainId: string;
          originDenom: string;
          originChainId: string;
        }[];
      };
    } = {};

    for (const key of Object.keys(this.response.data.dest_assets)) {
      if (this.chainStore.hasChain(key)) {
        const chainInfo = this.chainStore.getChain(key);
        if (!this.chainStore.isInChainInfosInListUI(chainInfo.chainId)) {
          continue;
        }

        if (
          this.chainStore.getChain(key).chainIdentifier ===
          ChainIdHelper.parse(this.chainId).identifier
        ) {
          continue;
        }

        const d = this.response.data.dest_assets[key];
        if (d) {
          const assets = d.assets
            .filter((asset) => {
              if (d.assets.length > 1 && asset.trace) {
                return false;
              }

              return (
                this.chainStore.hasChain(asset.chain_id) &&
                this.chainStore.hasChain(asset.origin_chain_id)
              );
            })
            .map((asset) => {
              return {
                denom: asset.denom,
                chainId: asset.chain_id,
                originDenom: asset.origin_denom,
                originChainId: asset.origin_chain_id,
              };
            });

          if (assets.length > 0) {
            result[key] = {
              assets,
            };
          }
        }
      }
    }

    return result;
  }

  protected override async fetchResponse(
    abortController: AbortController
  ): Promise<{ headers: any; data: AssetsFromSourceResponse }> {
    const _result = await simpleFetch<AssetsFromSourceResponse>(
      this.baseURL,
      this.url,
      {
        headers: {
          "content-type": "application/json",
          ...(() => {
            const res: { authorization?: string } = {};
            if (process.env["SKIP_API_KEY"]) {
              res.authorization = process.env["SKIP_API_KEY"];
            }

            return res;
          })(),
        },
        signal: abortController.signal,
      }
    );
    const result = {
      headers: _result.headers,
      data: _result.data,
    };

    const validated = Schema.validate(result.data);
    if (validated.error) {
      console.log(
        "Failed to validate assets from source response",
        validated.error
      );
      throw validated.error;
    }

    return {
      headers: result.headers,
      data: validated.value,
    };
  }

  protected override getCacheKey(): string {
    return `${super.getCacheKey()}-${this.chainId}-${this.denom}`;
  }
}

export class ObservableQueryAssetsFromSource extends HasMapStore<ObservableQueryAssetsFromSourceInner> {
  constructor(
    protected readonly sharedContext: QuerySharedContext,
    protected readonly chainStore: InternalChainStore,
    protected readonly skipURL: string
  ) {
    super((str) => {
      const parsed = JSON.parse(str);
      return new ObservableQueryAssetsFromSourceInner(
        this.sharedContext,
        this.chainStore,
        this.skipURL,
        parsed.chainId,
        parsed.denom
      );
    });
  }

  getSourceAsset(
    chainId: string,
    denom: string
  ): ObservableQueryAssetsFromSourceInner {
    const str = JSON.stringify({
      chainId,
      denom,
    });
    return this.get(str);
  }
}
