import { Message } from "@keplr-wallet/router";
import { ROUTE } from "./constants";
import { ViewAssetToken } from "./types";

export class GetAllDisabledViewAssetTokenMsg extends Message<
  Record<string, Record<string, string[]>>
> {
  public static type() {
    return "get-all-disabled-view-asset-token";
  }

  constructor() {
    super();
  }

  validateBasic(): void {
    //noop
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetAllDisabledViewAssetTokenMsg.type();
  }
}

export class GetDisabledViewAssetTokenListMsg extends Message<
  Record<string, string[]>
> {
  public static type() {
    return "get-disabled-view-asset-token-list";
  }

  constructor(public readonly vaultId: string) {
    super();
  }

  validateBasic(): void {
    if (!this.vaultId) {
      throw new Error("Empty vault id");
    }
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetDisabledViewAssetTokenListMsg.type();
  }
}

export class DisableViewAssetTokenMsg extends Message<
  Record<string, Record<string, string[]>>
> {
  public static type() {
    return "disable-view-asset-token";
  }

  constructor(
    public readonly vaultId: string,
    public readonly token: ViewAssetToken
  ) {
    super();
  }

  validateBasic(): void {
    if (!this.vaultId) {
      throw new Error("Empty vault id");
    }

    if (!this.token) {
      throw new Error("Empty token");
    }
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return DisableViewAssetTokenMsg.type();
  }
}

export class EnableViewAssetTokenMsg extends Message<
  Record<string, Record<string, string[]>>
> {
  public static type(): string {
    return "enable-view-asset-token";
  }

  constructor(
    public readonly vaultId: string,
    public readonly token: ViewAssetToken
  ) {
    super();
  }

  validateBasic(): void {
    if (!this.vaultId) {
      throw new Error("Empty vault id");
    }
    if (!this.token) {
      throw new Error("Empty token");
    }
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return EnableViewAssetTokenMsg.type();
  }
}
