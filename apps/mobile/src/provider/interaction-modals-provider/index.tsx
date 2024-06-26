import React, {
  FunctionComponent,
  PropsWithChildren,
  useState,
  useEffect,
} from 'react';
import {observer} from 'mobx-react-lite';
import {useStore} from '../../stores';
import {SignModal} from '../../screen/sign/sign-modal';
import {
  BasicAccessModal,
  SuggestChainModal,
  WalletConnectAccessModal,
  GlobalPermissionModal,
  AddTokenModal,
} from '../../components/modal';
import {AppState, BackHandler, Platform} from 'react-native';
import {WCMessageRequester} from '../../stores/wallet-connect/msg-requester';
import {ADR36SignModal} from '../../screen/sign/sign-adr36-modal';
import {SignEthereumModal} from '../../screen/sign/sign-ethereum-modal';
import {LoadingModal} from '../../components/modal/loading';
import {GoBackToBrowserModal} from '../../components/modal/go-back-to-browser.tsx';

export const InteractionModalsProvider: FunctionComponent<PropsWithChildren> =
  observer(({children}) => {
    const {
      signInteractionStore,
      signEthereumInteractionStore,
      permissionStore,
      chainSuggestStore,
      walletConnectStore,
      keyRingStore,
      tokensStore,
    } = useStore();

    const [showGoBackToBrowserIOS, setShowGoBackToBrowserIOS] = useState(false);

    useEffect(() => {
      if (walletConnectStore.needGoBackToBrowser) {
        if (Platform.OS === 'android') {
          BackHandler.exitApp();
        } else {
          setShowGoBackToBrowserIOS(true);
        }
      }
    }, [walletConnectStore.needGoBackToBrowser]);

    useEffect(() => {
      const listener = AppState.addEventListener('change', e => {
        if (e === 'background' || e === 'inactive') {
          setShowGoBackToBrowserIOS(false);
          walletConnectStore.clearNeedGoBackToBrowser();
        }
      });

      return () => {
        listener.remove();
      };
    }, [walletConnectStore]);

    const mergedPermissionData = permissionStore.waitingPermissionMergedData;

    return (
      <React.Fragment>
        {signInteractionStore.waitingData &&
        !signInteractionStore.waitingData.data.signDocWrapper.isADR36SignDoc ? (
          <SignModal
            isOpen={true}
            setIsOpen={() => {
              signInteractionStore.rejectWithProceedNext(
                signInteractionStore.waitingData?.id!,
                () => {},
              );
            }}
            interactionData={signInteractionStore.waitingData}
          />
        ) : null}

        {signInteractionStore.waitingData &&
        signInteractionStore.waitingData.data.signDocWrapper.isADR36SignDoc ? (
          <ADR36SignModal
            isOpen={true}
            setIsOpen={() => signInteractionStore.rejectAll()}
          />
        ) : null}

        {signEthereumInteractionStore.waitingData ? (
          <SignEthereumModal
            isOpen={true}
            setIsOpen={() => {
              signEthereumInteractionStore.rejectWithProceedNext(
                signEthereumInteractionStore.waitingData?.id!,
                () => {},
              );
            }}
            interactionData={signEthereumInteractionStore.waitingData}
          />
        ) : null}

        {keyRingStore.status === 'unlocked' &&
        (walletConnectStore.isPendingClientFromDeepLink ||
          walletConnectStore.isPendingWcCallFromDeepLinkClient) ? (
          <LoadingModal isOpen={true} setIsOpen={() => {}} />
        ) : null}

        {showGoBackToBrowserIOS ? (
          <GoBackToBrowserModal
            isOpen={showGoBackToBrowserIOS}
            setIsOpen={v => {
              if (!v) {
                setShowGoBackToBrowserIOS(false);
                walletConnectStore.clearNeedGoBackToBrowser();
              }
            }}
          />
        ) : null}

        {permissionStore.waitingGlobalPermissionData ? (
          <GlobalPermissionModal
            isOpen={true}
            setIsOpen={async () => {
              await permissionStore.rejectGlobalPermissionAll();
            }}
          />
        ) : null}

        {mergedPermissionData
          ? (() => {
              const data = mergedPermissionData;
              if (data.origins.length === 1) {
                if (WCMessageRequester.isVirtualURL(data.origins[0])) {
                  return (
                    <WalletConnectAccessModal
                      isOpen={true}
                      setIsOpen={async () =>
                        await permissionStore.rejectPermissionWithProceedNext(
                          data.ids,
                          () => {},
                        )
                      }
                      key={data.ids.join(',')}
                      data={data}
                    />
                  );
                }
              }

              return (
                <BasicAccessModal
                  isOpen={true}
                  setIsOpen={async () =>
                    await permissionStore.rejectPermissionWithProceedNext(
                      data.ids,
                      () => {},
                    )
                  }
                  key={data.ids.join(',')}
                  data={data}
                />
              );
            })()
          : null}

        {chainSuggestStore.waitingSuggestedChainInfo ? (
          <SuggestChainModal
            isOpen={true}
            setIsOpen={async () => {
              await chainSuggestStore.rejectAll();
            }}
          />
        ) : null}

        {tokensStore.waitingSuggestedToken ? (
          <AddTokenModal
            isOpen={true}
            setIsOpen={async () => {
              await tokensStore.rejectAllSuggestedTokens();
            }}
          />
        ) : null}

        {children}
      </React.Fragment>
    );
  });
