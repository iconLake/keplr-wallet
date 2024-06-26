import {flow, makeObservable, observable} from 'mobx';
import * as Keychain from 'react-native-keychain';
import {SECURITY_RULES} from 'react-native-keychain';
import {KVStore, toGenerator} from '@keplr-wallet/common';
import {KeyRingStore} from '@keplr-wallet/stores-core';
import * as LocalAuthentication from 'expo-local-authentication';
import {Platform} from 'react-native';

export class KeychainStore {
  @observable
  protected _isBiometrySupported: boolean = false;

  @observable
  protected _isBiometryOn: boolean = false;

  protected static defaultOptions: Keychain.Options = {
    authenticationPrompt: {
      title: 'Biometric Authentication',
      cancel: 'Cancel',
    },
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
    rules: SECURITY_RULES.AUTOMATIC_UPGRADE,
  };

  constructor(
    protected readonly kvStore: KVStore,
    protected readonly keyRingStore: KeyRingStore,
  ) {
    makeObservable(this);

    this.init();
  }

  get isBiometrySupported(): boolean {
    return this._isBiometrySupported;
  }

  get isBiometryOn(): boolean {
    return this._isBiometryOn;
  }

  async getPasswordWithBiometry(): Promise<string> {
    if (!this.isBiometryOn) {
      throw new Error('Biometry is off');
    }

    if (Platform.OS === 'android') {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Biometric Authentication',
        disableDeviceFallback: true,
        cancelLabel: 'Cancel',
      });

      if (!res.success) {
        throw new Error('Failed to authenticate');
      }
    }
    const credentials = await Keychain.getGenericPassword(
      KeychainStore.defaultOptions,
    );
    if (credentials) {
      return credentials.password;
    } else {
      throw new Error('Failed to get credentials from keychain');
    }
  }

  @flow
  *tryUnlockWithBiometry() {
    if (!this.isBiometryOn) {
      throw new Error('Biometry is off');
    }

    if (Platform.OS === 'android') {
      const res = yield* toGenerator(
        LocalAuthentication.authenticateAsync({
          promptMessage: 'Biometric Authentication',
          disableDeviceFallback: true,
          cancelLabel: 'Cancel',
        }),
      );
      if (!res.success) {
        throw new Error('Failed to authenticate');
      }
    }
    const credentials = yield* toGenerator(
      Keychain.getGenericPassword(KeychainStore.defaultOptions),
    );
    if (credentials) {
      yield this.keyRingStore.unlock(credentials.password);
    } else {
      throw new Error('Failed to get credentials from keychain');
    }
  }

  @flow
  *turnOnBiometry(password: string) {
    const valid = yield* toGenerator(this.keyRingStore.checkPassword(password));
    if (valid) {
      const result = yield* toGenerator(
        Keychain.setGenericPassword(
          'keplr',
          password,
          KeychainStore.defaultOptions,
        ),
      );
      if (result) {
        this._isBiometryOn = true;
        yield this.save();
      }
    } else {
      throw new Error('Invalid password');
    }
  }

  @flow
  *turnOffBiometry() {
    if (this.isBiometryOn) {
      if (Platform.OS === 'android') {
        const res = yield* toGenerator(
          LocalAuthentication.authenticateAsync({
            promptMessage: 'Biometric Authentication',
            disableDeviceFallback: true,
            cancelLabel: 'Cancel',
          }),
        );
        if (!res.success) {
          throw new Error('Failed to authenticate');
        }
      }
      const credentials = yield* toGenerator(
        Keychain.getGenericPassword(KeychainStore.defaultOptions),
      );
      if (credentials) {
        if (
          yield* toGenerator(
            this.keyRingStore.checkPassword(credentials.password),
          )
        ) {
          const result = yield* toGenerator(
            Keychain.resetGenericPassword(KeychainStore.defaultOptions),
          );
          if (result) {
            this._isBiometryOn = false;
            yield this.save();
          }
        } else {
          throw new Error(
            'Failed to get valid password from keychain. This may be due to changes of biometry information',
          );
        }
      } else {
        throw new Error('Failed to get credentials from keychain');
      }
    }
  }

  @flow
  *turnOffBiometryWithPassword(password: string) {
    if (this.isBiometryOn) {
      if (yield* toGenerator(this.keyRingStore.checkPassword(password))) {
        const result = yield* toGenerator(
          Keychain.resetGenericPassword(KeychainStore.defaultOptions),
        );
        if (result) {
          this._isBiometryOn = false;
          yield this.save();
        }
      } else {
        throw new Error('Invalid password');
      }
    }
  }

  @flow
  *reset() {
    if (this.isBiometryOn) {
      const result = yield* toGenerator(
        Keychain.resetGenericPassword(KeychainStore.defaultOptions),
      );
      if (result) {
        this._isBiometryOn = false;
        yield this.save();
      }
    }
  }

  @flow
  protected *init() {
    // No need to await.
    this.restore();

    const type = yield* toGenerator(
      Keychain.getSupportedBiometryType(KeychainStore.defaultOptions),
    );
    this._isBiometrySupported = type != null;
  }

  @flow
  protected *restore() {
    const saved = yield* toGenerator(this.kvStore.get('isBiometryOn'));
    this._isBiometryOn = saved === true;
  }

  protected async save() {
    await this.kvStore.set('isBiometryOn', this.isBiometryOn);
  }
}
