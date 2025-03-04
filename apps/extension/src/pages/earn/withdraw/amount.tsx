import React, { Fragment, FunctionComponent, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { HeaderLayout } from "../../../layouts/header";
import { BackButton } from "../../../layouts/header/components";

import { Stack } from "../../../components/stack";

import { useNavigate, useSearchParams } from "react-router-dom";

import { useStore } from "../../../stores";
import {
  EmptyAmountError,
  useGasSimulator,
  useTxConfigsValidate,
  ZeroAmountError,
} from "@keplr-wallet/hooks";
import {
  Body2,
  Body3,
  H3,
  MobileH3,
  Subtitle3,
  Subtitle4,
} from "../../../components/typography";
import { Box } from "../../../components/box";
import { Gutter } from "../../../components/gutter";
import { CoinPretty, Dec } from "@keplr-wallet/unit";
import { useIntl } from "react-intl";
import { ColorPalette } from "../../../styles";
import { Input } from "../components/input";
import { XAxis, YAxis } from "../../../components/axis";
import { LongArrowDownIcon } from "../../../components/icon/long-arrow-down";
import {
  NobleEarnAmountConfig,
  useNobleEarnAmountConfig,
} from "@keplr-wallet/hooks-internal";
import { ApyChip } from "../components/chip";
import { ExtensionKVStore } from "@keplr-wallet/common";
import { WarningBox } from "../../../components/warning-box";
import { HorizontalCollapseTransition } from "../../../components/transition/horizontal-collapse";

const NOBLE_EARN_WITHDRAW_OUT_COIN_MINIMAL_DENOM = "uusdc";

export const EarnWithdrawAmountPage: FunctionComponent = observer(() => {
  const { accountStore, chainStore, queriesStore } = useStore();
  const [searchParams] = useSearchParams();
  const intl = useIntl();
  const navigate = useNavigate();

  const initialChainId = searchParams.get("chainId");
  const initialCoinMinimalDenom = searchParams.get("coinMinimalDenom");

  const chainId = initialChainId || chainStore.chainInfosInUI[0].chainId;
  const chainInfo = chainStore.getChain(chainId);
  const account = accountStore.getAccount(chainId);

  const coinMinimalDenom =
    initialCoinMinimalDenom || chainInfo.currencies[0].coinMinimalDenom;
  const currency = chainInfo.forceFindCurrency(coinMinimalDenom);

  const outCurrency = chainInfo.forceFindCurrency(
    NOBLE_EARN_WITHDRAW_OUT_COIN_MINIMAL_DENOM
  );

  const queryBalances = queriesStore.get(chainId).queryBalances;
  const sender = account.bech32Address;
  const balance =
    queryBalances.getQueryBech32Address(sender).getBalance(currency)?.balance ??
    new CoinPretty(currency, new Dec("0"));

  const nobleEarnAmountConfig = useNobleEarnAmountConfig(
    chainStore,
    queriesStore,
    accountStore,
    chainId,
    sender,
    currency,
    outCurrency
  );

  const error = useMemo(() => {
    const uiProperties = nobleEarnAmountConfig.amountConfig.uiProperties;

    const err = uiProperties.error || uiProperties.warning;

    if (err instanceof EmptyAmountError) {
      return;
    }

    if (err instanceof ZeroAmountError) {
      return;
    }

    if (err) {
      return err.message || err.toString();
    }
  }, [nobleEarnAmountConfig.amountConfig.uiProperties]);

  const [isConfirmView, setIsConfirmView] = useState(false);

  const poolForWithdraw = nobleEarnAmountConfig.amountConfig.pool;

  const gasSimulator = useGasSimulator(
    new ExtensionKVStore("gas-simulator.main.send"),
    chainStore,
    chainId,
    nobleEarnAmountConfig.gasConfig,
    nobleEarnAmountConfig.feeConfig,
    "noble-earn-withdraw",
    () => {
      if (!nobleEarnAmountConfig.amountConfig.currency) {
        throw new Error("Withdraw currency not set");
      }

      if (
        nobleEarnAmountConfig.amountConfig.uiProperties.loadingState ===
          "loading-block" ||
        nobleEarnAmountConfig.amountConfig.uiProperties.error != null
      ) {
        throw new Error("Not ready to simulate tx");
      }

      return account.noble.makeSwapTx(
        "noble-earn-withdraw",
        nobleEarnAmountConfig.amountConfig.amount[0].toDec().toString(),
        currency,
        nobleEarnAmountConfig.amountConfig.minOutAmount.toDec().toString(),
        outCurrency,
        [
          {
            poolId: poolForWithdraw?.id.toString() ?? "",
            denomTo: outCurrency.coinMinimalDenom,
          },
        ]
      );
    }
  );

  const txConfigsValidate = useTxConfigsValidate({
    ...nobleEarnAmountConfig,
    gasSimulator,
  });

  return (
    <HeaderLayout
      title={""} // No title for this page
      displayFlex={true}
      fixedMinHeight={true}
      left={
        <BackButton
          {...(isConfirmView
            ? {
                onClick: () => {
                  setIsConfirmView(false);
                },
              }
            : {})}
        />
      }
      animatedBottomButtons={true}
      hideBottomButtons={
        txConfigsValidate.interactionBlocked ||
        !!nobleEarnAmountConfig.amountConfig.error
      }
      bottomButtons={[
        {
          text: intl.formatMessage({ id: "button.next" }),
          color: "primary",
          size: "large",
          type: "submit",
          isLoading:
            accountStore.getAccount(chainId).isSendingMsg === "ibcTransfer",
        },
      ]}
      onSubmit={async (e) => {
        e.preventDefault();

        if (
          txConfigsValidate.interactionBlocked ||
          !!nobleEarnAmountConfig.amountConfig.error
        ) {
          return;
        }

        if (!isConfirmView) {
          setIsConfirmView(true);
        } else {
          if (!poolForWithdraw) {
            throw new Error("No pool for withdraw");
          }

          try {
            const tx = account.noble.makeSwapTx(
              "noble-earn-withdraw",
              nobleEarnAmountConfig.amountConfig.amount[0].toDec().toString(),
              currency,
              nobleEarnAmountConfig.amountConfig.minOutAmount
                .toDec()
                .toString(),
              outCurrency,
              [
                {
                  poolId: poolForWithdraw.id.toString(),
                  denomTo: outCurrency.coinMinimalDenom,
                },
              ]
            );

            await tx.send(
              nobleEarnAmountConfig.feeConfig.toStdFee(),
              undefined,
              undefined,
              {
                onBroadcasted: (_txHash) => {
                  navigate("/tx-result/pending");

                  // TODO: Log analytics
                },
                onFulfill: (tx: any) => {
                  if (tx.code != null && tx.code !== 0) {
                    console.log(tx.log ?? tx.raw_log);
                    navigate("/tx-result/failed");

                    return;
                  }

                  navigate("/tx-result/success");
                },
              }
            );
          } catch (e) {
            if (e?.message === "Request rejected") {
              setIsConfirmView(true);
              return;
            }
            console.error(e);
            navigate("/tx-result/failed");
          }
        }
      }}
    >
      {isConfirmView ? (
        <ConfirmView amountConfig={nobleEarnAmountConfig.amountConfig} />
      ) : (
        <Box
          paddingTop="2rem"
          paddingX="1.5rem"
          style={{
            flex: 1,
          }}
        >
          <Stack flex={1}>
            <MobileH3 color={ColorPalette["white"]}>
              {intl.formatMessage(
                { id: "page.earn.withdraw.amount.title" },
                {
                  br: <br />,
                }
              )}
            </MobileH3>

            <Gutter size="2rem" />
            <Input
              type="number"
              placeholder={balance.trim(true).toString()}
              value={nobleEarnAmountConfig.amountConfig.value}
              warning={error != null}
              onChange={(e) => {
                nobleEarnAmountConfig.amountConfig.setValue(e.target.value);
              }}
              autoComplete="off"
            />
            <Gutter size="0.75rem" />
            <Box padding="0.25rem 0">
              <XAxis alignY="center">
                <HorizontalCollapseTransition
                  collapsed={
                    !nobleEarnAmountConfig.amountConfig.amount[0]
                      .toDec()
                      .equals(new Dec("0"))
                  }
                >
                  <XAxis alignY="center">
                    <Box
                      padding="0.25rem 0.5rem"
                      backgroundColor={ColorPalette["gray-550"]}
                      borderRadius="0.5rem"
                      width="fit-content"
                      cursor="pointer"
                      onClick={() => {
                        nobleEarnAmountConfig.amountConfig.setFraction(1);
                      }}
                    >
                      <Subtitle4 color={ColorPalette["gray-200"]}>
                        {balance.trim(true).toString()}
                      </Subtitle4>
                    </Box>
                    <Gutter size="0.25rem" />
                  </XAxis>
                </HorizontalCollapseTransition>
                <Subtitle3 color={ColorPalette["gray-300"]}>
                  {intl.formatMessage(
                    { id: "page.earn.amount.balance.current-chain" },
                    { chain: chainInfo.chainName }
                  )}
                </Subtitle3>
                <Subtitle3 color={ColorPalette["gray-300"]}>
                  {`on ${chainInfo.chainName}`}
                </Subtitle3>
              </XAxis>
            </Box>

            {error && (
              <Box marginTop="0.75rem">
                <Body2 color={ColorPalette["red-300"]}>{error}</Body2>
              </Box>
            )}

            {nobleEarnAmountConfig.amountConfig.expectedOutAmount
              .toDec()
              .gt(new Dec("0")) && (
              <Fragment>
                <YAxis alignX="center">
                  <LongArrowDownIcon
                    width="1.5rem"
                    height="1.5rem"
                    color={ColorPalette["gray-400"]}
                  />
                </YAxis>
                <Gutter size="1rem" />

                <MobileH3>
                  {nobleEarnAmountConfig.amountConfig.expectedOutAmount
                    .trim(true)
                    .toString()}
                </MobileH3>
                <Gutter size="0.5rem" />
                <Subtitle3 color={ColorPalette["gray-300"]}>
                  {`on ${chainInfo.chainName}`}
                </Subtitle3>
              </Fragment>
            )}

            {nobleEarnAmountConfig.amountConfig.error && (
              <Box marginTop="1rem">
                <WarningBox
                  title={
                    nobleEarnAmountConfig.amountConfig.error?.message ?? ""
                  }
                />
              </Box>
            )}
          </Stack>
        </Box>
      )}
    </HeaderLayout>
  );
});

const ConfirmView: FunctionComponent<{
  amountConfig: NobleEarnAmountConfig;
}> = observer(({ amountConfig }) => {
  const intl = useIntl();

  return (
    <Box
      paddingTop="2rem"
      paddingX="1.5rem"
      style={{
        flex: 1,
      }}
    >
      <Stack flex={1}>
        <MobileH3 color={ColorPalette["white"]}>
          {intl.formatMessage(
            { id: "page.earn.withdraw.amount.confirm.title" },
            {
              from: amountConfig.amount[0].trim(true).toString(),
              to: amountConfig.expectedOutAmount.trim(true).toString(),
              br: <br />,
            }
          )}
        </MobileH3>
        <Gutter size="1rem" />
        <Body2 color={ColorPalette["gray-200"]}>
          {intl.formatMessage(
            {
              id: "page.earn.withdraw.amount.confirm.description",
            },
            {
              to: amountConfig.expectedOutAmount.trim(true).toString(),
              chain: amountConfig.chainInfo.chainName,
            }
          )}
        </Body2>

        <Gutter size="1.75rem" />
        <Box
          padding="1rem"
          borderRadius="0.75rem"
          backgroundColor={ColorPalette["gray-650"]}
        >
          <ApyChip chainId={amountConfig.chainId} colorType="green" />
          <Gutter size="0.75rem" />
          <XAxis alignY="center" gap="0.25rem">
            <H3 color={ColorPalette["white"]}>
              {amountConfig.amount[0].hideDenom(true).trim(true).toString()}
            </H3>
            <H3 color={ColorPalette["gray-300"]}>
              {amountConfig.amount[0].currency.coinDenom}
            </H3>
          </XAxis>
          <Gutter size="0.25rem" />

          <Body3
            color={ColorPalette["gray-300"]}
            style={{ textAlign: "right" }}
          >
            {`on ${amountConfig.chainInfo.chainName}`}
          </Body3>

          <Gutter size="0.25rem" />

          <YAxis alignX="center">
            <LongArrowDownIcon
              width="1.5rem"
              height="1.5rem"
              color={ColorPalette["gray-400"]}
            />
          </YAxis>

          <Gutter size="0.75rem" />

          <Box
            padding="0.25rem 0.5rem"
            backgroundColor={ColorPalette["gray-600"]}
            borderRadius="0.375rem"
            width="fit-content"
          >
            <Subtitle4 color={ColorPalette["gray-300"]}>
              {intl.formatMessage({
                id: "page.earn.withdraw.amount.confirm.norewards",
              })}
            </Subtitle4>
          </Box>

          <Gutter size="0.75rem" />

          <XAxis alignY="center" gap="0.25rem">
            <H3 color={ColorPalette["white"]}>
              {amountConfig.expectedOutAmount
                .hideDenom(true)
                .trim(true)
                .toString()}
            </H3>
            <H3 color={ColorPalette["gray-300"]}>
              {amountConfig.expectedOutAmount.currency.coinDenom}
            </H3>
          </XAxis>
          <Gutter size="0.25rem" />

          <Body3
            color={ColorPalette["gray-300"]}
            style={{ textAlign: "right" }}
          >
            {`on ${amountConfig.chainInfo.chainName}`}
          </Body3>
        </Box>
      </Stack>
    </Box>
  );
});
