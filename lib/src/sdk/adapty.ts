import { Platform } from 'react-native';

import { bridgeArg, bridgeCall } from '../internal/bridge';
import * as Coder from '../internal/coders';

import * as Model from '../types';
import * as Input from '../types/inputs';

import { AdaptyEventEmitter } from './eventEmitter';
import { AdaptyError } from './error';
import { LogContext, Log } from '../logger';

/**
 * Entry point for the Adapty SDK.
 * All Adapty methods are available through this class.
 * @public
 */
export class Adapty extends AdaptyEventEmitter {
  private static callNative = bridgeCall;

  private shouldWaitUntilReady = false;
  private activationPromise: Promise<void> | null = null;

  constructor() {
    super();
  }

  /**
   * Blocks the current thread until the SDK is initialized.
   *
   * @remarks
   * Applied automatically to all methods
   * if `lockMethodsUntilReady` is set to `true` in {@link activate}.
   *
   * @returns {Promise<void>} A promise that resolves when the SDK is initialized.
   * @throws {@link AdaptyError} same error as activation or error if SDK is not activated
   */
  public async waitUntilActive(): Promise<void> {
    if (!this.activationPromise) {
      return Promise.reject(AdaptyError.notInitializedError());
    }
    return this.activationPromise;
  }

  /**
   * Locks the current thread until the SDK is initialized, if needed.
   * @internal
   */
  private async waitUntilReady(): Promise<void> {
    if (!this.shouldWaitUntilReady) {
      return Promise.resolve();
    }

    await this.waitUntilActive();
  }

  /**
   * Initializes the Adapty SDK.
   *
   * @remarks
   * This method must be called in order for the SDK to work.
   * It is preffered to call it as early as possible in the app lifecycle,
   * so background activities can be performed and cache can be updated.
   *
   * @example
   * ## Basic usage in your app's entry point
   * ```ts
   *  adapty.activate('YOUR_API_KEY'); // <-- pass your API key here (required)
   * ```
   *
   * ## Usage with your user identifier from your system
   * ```ts
   * adapty.activate('YOUR_API_KEY', { // <-- pass your API key here (required)
   *   customerUserId: 'YOUR_USER_ID'  // <-- pass your user identifier here (optional)
   * });
   * ```
   *
   * @param {string} apiKey - You can find it in your app settings
   * in {@link https://app.adapty.io/ | Adapty Dashboard} App settings > General.
   * @param {Input.ActivateParamsInput} options - Optional parameters of type {@link ActivateParamsInput}.
   * @returns {Promise<void>} A promise that resolves when the SDK is initialized.
   *
   * @throws {@link AdaptyError}
   * Usually throws if the SDK is already activated or if the API key is invalid.
   */
  public async activate(
    apiKey: string,
    params: Input.ActivateParamsInput = {},
  ): Promise<void> {
    const observerMode = params.observerMode ?? false;
    const customerUserId = params.customerUserId;
    const logLevel = params.logLevel;
    const enableUsageLogs = params.enableUsageLogs;

    // call before log ctx calls, so no logs are lost
    Log.logLevel = logLevel || null;

    const ctx = new LogContext();
    console.log('this name', this.activate.name);
    const log = ctx.call({ methodName: 'activate' });
    log.start({ apiKey, params });

    this.shouldWaitUntilReady = params.lockMethodsUntilReady ?? false;

    try {
      const promise = Adapty.callNative(
        'activate',
        {
          [bridgeArg.SDK_KEY]: apiKey,
          [bridgeArg.OBSERVER_MODE]: observerMode,
          [bridgeArg.USER_ID]: customerUserId,
          [bridgeArg.LOG_LEVEL]: logLevel,
          [bridgeArg.ENABLE_USAGE_LOGS]: enableUsageLogs,
        },
        ctx,
      );

      if (!this.activationPromise) {
        this.activationPromise = promise as Promise<any>;
      }

      await promise;
      log.success(null);
    } catch (nativeError) {
      const error = AdaptyError.tryWrap(nativeError);

      log.success({ error });
      throw error;
    }
  }

  /**
   * Fetches a paywall by its developer ID.
   *
   * @remarks
   * Adapty allows you remotely configure the products
   * that will be displayed in your app.
   * This way you don’t have to hardcode the products
   * and can dynamically change offers or run A/B tests without app releases.
   *
   * @param {string} id - The identifier of the desired paywall.
   * This is the value you specified when you created the paywall
   * in the Adapty Dashboard.
   * @param {string | undefined} [locale] - The locale of the desired paywall.
   * @returns {Promise<Model.AdaptyPaywall>}
   * A promise that resolves with a requested paywall.
   *
   * @throws {@link AdaptyError}
   * Throws an error:
   * 1. if the paywall with the specified ID is not found
   * 2. if your bundle ID does not match with your Adapty Dashboard setup
   */
  public async getPaywall(
    id: string,
    locale?: string,
  ): Promise<Model.AdaptyPaywall> {
    const ctx = new LogContext();

    const log = ctx.call({ methodName: this.getPaywall.name });
    log.start({ id, locale });

    await this.waitUntilReady();

    try {
      const args = {
        [bridgeArg.ID]: id,
        ...(locale ? { [bridgeArg.LOCALE]: locale } : {}),
      };

      const response = await Adapty.callNative('get_paywall', args, ctx);

      if (!response) {
        const error = AdaptyError.deserializationError(this.getPaywall.name);
        throw error;
      }

      const maybeObj = JSON.parse(response);
      const decoded = Coder.AdaptyPaywallCoder.tryDecode(maybeObj, ctx);
      const result = decoded.toObject();

      log.success(result);
      return result;
    } catch (nativeError) {
      const error = AdaptyError.tryWrap(nativeError);

      log.success({ error });
      throw error;
    }
  }

  /**
   * Fetches a list of products associated with a provided paywall.
   *
   * @example
   * ```ts
   * const paywall = await adapty.getPaywall('paywall_id');
   * const products = await adapty.getPaywallProducts(paywall);
   * ```
   *
   * @param {Model.AdaptyPaywall} paywall - a paywall to fetch products for. You can get it using {@link Adapty.getPaywall} method.
   * @param {Input.GetPaywallProductsParamsInput} [params] - Optional parameters of type {@link GetPaywallProductsParamsInput}.
   * @returns {Promise<Model.AdaptyProduct[]>} A promise that resolves with a list
   * of {@link Model.AdaptyProduct} associated with a provided paywall.
   * @throws {@link AdaptyError}
   */
  public async getPaywallProducts(
    paywall: Model.AdaptyPaywall,
    params: Input.GetPaywallProductsParamsInput = {},
  ): Promise<Model.AdaptyProduct[]> {
    const ctx = new LogContext();

    const log = ctx.call({ methodName: this.getPaywallProducts.name });
    log.start({ paywall, params });

    await this.waitUntilReady();

    try {
      const fetchPolicy = params.ios?.fetchPolicy || 'default';
      const data = new Coder.AdaptyPaywallCoder(paywall);

      const args = {
        [bridgeArg.PAYWALL]: JSON.stringify(data.encode(ctx)),
        ...(Platform.OS === 'ios' && {
          [bridgeArg.FETCH_POLICY]: fetchPolicy,
        }),
      };

      const result = await Adapty.callNative('get_paywall_products', args, ctx);

      if (!result) {
        throw AdaptyError.deserializationError(this.getPaywallProducts.name);
      }

      const maybeArr = JSON.parse(result);
      if (!Array.isArray(maybeArr)) {
        throw AdaptyError.deserializationError(this.getPaywallProducts.name);
      }

      const products = maybeArr.map(product => {
        const decoder = Coder.AdaptyProductCoder.tryDecode(product, ctx);
        return decoder.toObject();
      });

      log.success(products);
      return products;
    } catch (nativeError) {
      const error = AdaptyError.tryWrap(nativeError);

      log.success({ error });
      throw error;
    }
  }

  /**
   * Fetches a user profile.
   *
   * Allows you to define the level of access,
   * as well as other parameters.
   *
   * @remarks
   * The getProfile method provides the most up-to-date result
   * as it always tries to query the API.
   * If for some reason (e.g. no internet connection),
   * the Adapty SDK fails to retrieve information from the server,
   * the data from cache will be returned.
   * It is also important to note
   * that the Adapty SDK updates {@link Model.AdaptyProfile} cache
   * on a regular basis, in order
   * to keep this information as up-to-date as possible.
   *
   * @returns {Promise<Model.AdaptyProfile>}
   * @throws {@link AdaptyError}
   */
  public async getProfile(): Promise<Model.AdaptyProfile> {
    const ctx = new LogContext();

    const log = ctx.call({ methodName: this.getProfile.name });
    log.start({});

    await this.waitUntilReady();

    try {
      const response = await Adapty.callNative('get_profile', {}, ctx);

      if (!response) {
        throw AdaptyError.deserializationError(this.getProfile.name);
      }
      const maybeObj = JSON.parse(response);
      const decoder = Coder.AdaptyProfileCoder.tryDecode(maybeObj, ctx);

      const result = decoder.toObject();

      log.success(result);
      return result;
    } catch (nativeError) {
      const error = AdaptyError.tryWrap(nativeError);

      log.success({ error });
      throw error;
    }
  }

  /**
   * Logs in a user with a provided customerUserId.
   *
   * If you don't have a user id on SDK initialization,
   * you can set it later at any time with this method.
   * The most common cases are after registration/authorization
   * when the user switches from being an anonymous user to an authenticated user.
   *
   * @param {string} customerUserId - unique user id
   * @throws {@link AdaptyError}
   */
  public async identify(customerUserId: string): Promise<void> {
    const ctx = new LogContext();

    const log = ctx.call({ methodName: this.identify.name });
    log.start({ customerUserId });

    await this.waitUntilReady();

    try {
      const args = {
        [bridgeArg.USER_ID]: customerUserId,
      };

      await Adapty.callNative('identify', args, ctx);
      log.success();
    } catch (nativeError) {
      const error = AdaptyError.tryWrap(nativeError);

      log.success({ error });
      throw error;
    }
  }

  /**
   * Logs a paywall view event.
   *
   * Adapty helps you to measure the performance of the paywalls.
   * We automatically collect all the metrics related to purchases except for paywall views.
   * This is because only you know when the paywall was shown to a customer.
   *
   * @remarks
   * Whenever you show a paywall to your user,
   * call this function to log the event,
   * and it will be accumulated in the paywall metrics.
   *
   * @example
   * ```ts
   * const paywall = await adapty.getPaywall('paywall_id');
   * // ...after opening the paywall
   * adapty.logShowPaywall(paywall);
   * ```
   *
   * @param {Model.AdaptyPaywall} paywall - object that was shown to the user.
   * @returns {Promise<void>} resolves when the event is logged
   */
  public async logShowPaywall(paywall: Model.AdaptyPaywall): Promise<void> {
    const ctx = new LogContext();

    const log = ctx.call({ methodName: this.logShowPaywall.name });
    log.start({ paywall });

    await this.waitUntilReady();

    try {
      const data = new Coder.AdaptyPaywallCoder(paywall);
      const args = {
        [bridgeArg.PAYWALL]: JSON.stringify(data.encode(ctx)),
      };

      await Adapty.callNative('log_show_paywall', args, ctx);

      log.success();
    } catch (nativeError) {
      const error = AdaptyError.tryWrap(nativeError);

      log.success({ error });
      throw error;
    }
  }

  /**
   * Logs an onboarding screen view event.
   *
   * In order for you to be able to analyze user behavior
   * at this critical stage without leaving Adapty,
   * we have implemented the ability to send dedicated events
   * every time a user visits yet another onboarding screen.
   *
   * @remarks
   * Even though there is only one mandatory parameter in this function,
   * we recommend that you think of names for all the screens,
   * as this will make the work of analysts
   * during the data examination phase much easier.
   *
   * @example
   * ```ts
   * adapty.logShowOnboarding(1, 'onboarding_name', 'screen_name');
   * ```
   *
   * @param {number} screenOrder - The number of the screen that was shown to the user.
   * @param {string} [onboardingName] - The name of the onboarding.
   * @param {string} [screenName] - The name of the screen.
   * @returns {Promise<void>} resolves when the event is logged
   * @throws {@link AdaptyError}
   */
  public async logShowOnboarding(
    screenOrder: number,
    onboardingName?: string,
    screenName?: string,
  ): Promise<void> {
    const ctx = new LogContext();

    const log = ctx.call({ methodName: this.logShowOnboarding.name });
    log.start({ screenOrder, onboardingName, screenName });

    await this.waitUntilReady();

    const args = {
      [bridgeArg.ONBOARDING_PARAMS]: JSON.stringify({
        onboarding_screen_order: screenOrder,
        onboarding_name: onboardingName,
        onboarding_screen_name: screenName,
      }),
    };

    try {
      await Adapty.callNative('log_show_onboarding', args, ctx);

      log.success();
    } catch (nativeError) {
      const error = AdaptyError.tryWrap(nativeError);

      log.success({ error });
      throw error;
    }
  }

  /**
   * Logs out the current user.
   * You can then login the user using {@link Adapty.identify} method.
   *
   * @throws {@link AdaptyError}
   */
  public async logout(): Promise<void> {
    const ctx = new LogContext();

    const log = ctx.call({ methodName: this.logout.name });
    log.start({});

    await this.waitUntilReady();

    try {
      await Adapty.callNative('logout', {}, ctx);

      log.success();
    } catch (nativeError) {
      const error = AdaptyError.tryWrap(nativeError);

      log.success({ error });
      throw error;
    }
  }

  /**
   * Performs a purchase of the specified product.
   *
   * All the available promotions will be applied automatically.
   *
   * @remarks
   * Successful purchase will also result in a call to `'onLatestProfileLoad'` listener.
   * You can use {@link Adapty.addEventListener} to subscribe to this event and handle
   * the purchase result outside of this thread.
   *
   * @param {Model.AdaptyProduct} product - The product to e purchased.
   * You can get the product using {@link Adapty.getPaywallProducts} method.
   * @returns {Promise<Model.AdaptyProfile>} A Promise that resolves to an {@link Model.AdaptyProfile} object
   * containing the user's profile information after the purchase is made.
   * @throws {AdaptyError} If an error occurs during the purchase process
   * or while decoding the response from the native SDK.
   * Some of the possible errors are:
   * * #1006 — User has cancelled
   *
   * @example
   * ```ts
   * try {
   *   const paywall = await adapty.getPaywall('onboarding');
   *   const products = await adapty.getPaywallProducts(paywall);
   *   const product = products[0];
   *
   *   const profile = await adapty.makePurchase(product);
   *   // successfull purchase
   * } catch (error) {
   *   // handle error
   * }
   * ```
   */
  public async makePurchase(
    product: Model.AdaptyProduct,
  ): Promise<Model.AdaptyProfile> {
    const ctx = new LogContext();

    const log = ctx.call({ methodName: this.makePurchase.name });
    log.start({ product });

    await this.waitUntilReady();

    const data = new Coder.AdaptyProductCoder(product);
    const args = { [bridgeArg.PRODUCT]: JSON.stringify(data.encode(ctx)) };

    try {
      const response = await Adapty.callNative('make_purchase', args, ctx);

      if (!response) {
        throw AdaptyError.deserializationError(this.makePurchase.name);
      }

      const maybeObj = JSON.parse(response);
      const decoder = Coder.AdaptyProfileCoder.tryDecode(maybeObj, ctx);

      const result = decoder.toObject();

      log.success(result);
      return result;
    } catch (nativeError) {
      const error = AdaptyError.tryWrap(nativeError);

      log.success({ error });
      throw error;
    }
  }

  /**
   * Opens a native modal screen to redeem Apple Offer Codes.
   *
   * @remarks
   * iOS 14+ only.
   */
  public async presentCodeRedemptionSheet(): Promise<void> {
    const ctx = new LogContext();

    const log = ctx.call({ methodName: this.presentCodeRedemptionSheet.name });
    log.start({});

    await this.waitUntilReady();

    // does not throw
    await Adapty.callNative('present_code_redemption_sheet', {}, ctx);
    log.success();
  }

  /**
   * Restores user purchases and updates the profile.
   *
   * @returns {Promise<Model.AdaptyProfile>} resolves with the updated profile
   * @throws {@link AdaptyError} if an error occurs during the restore proccess or while decoding the response
   */
  public async restorePurchases(): Promise<Model.AdaptyProfile> {
    const ctx = new LogContext();

    const log = ctx.call({ methodName: this.restorePurchases.name });
    log.start({});

    await this.waitUntilReady();

    try {
      const response = await Adapty.callNative('restore_purchases', {}, ctx);

      if (!response) {
        throw AdaptyError.deserializationError(this.restorePurchases.name);
      }

      const maybeObj = JSON.parse(response);
      const decoder = Coder.AdaptyProfileCoder.tryDecode(maybeObj, ctx);

      const result = decoder.toObject();

      log.success(result);
      return result;
    } catch (nativeError) {
      const error = AdaptyError.tryWrap(nativeError);

      log.success({ error });
      throw error;
    }
  }

  /**
   * Sets the fallback paywalls.
   *
   * Fallback paywalls will be used if the SDK fails
   * to fetch the paywalls from the dashboard.
   * It is not designed to be used for the offline flow,
   * as products are not cached in Adapty.
   *
   * @returns {Promise<void>} resolves when fallback paywalls are saved
   */
  public async setFallbackPaywalls(paywalls: string): Promise<void> {
    const ctx = new LogContext();

    const log = ctx.call({ methodName: this.setFallbackPaywalls.name });
    log.start({ paywalls });

    await this.waitUntilReady();

    const args = { [bridgeArg.PAYWALLS]: paywalls };

    try {
      await Adapty.callNative('set_fallback_paywalls', args, ctx);
      log.success();
    } catch (nativeError) {
      const error = AdaptyError.tryWrap(nativeError);

      log.success({ error });
      throw error;
    }
  }

  /**
   * Sets the preferred log level.
   *
   * By default, the log level is set to `error`.
   *
   * @remarks
   * There are four levels available:
   * `error`: only errors will be logged
   * `warn`: messages from the SDK that do not cause critical errors, but are worth paying attention to
   * `info`: various information messages, such as those that log the lifecycle of various modules
   * `verbose`: any additional information that may be useful during debugging, such as function calls, API queries, etc.
   *
   * @param {Input.LogLevel} logLevel - new preferred log level
   * @returns {Promise<void>} resolves when the log level is set
   * @throws {@link AdaptyError} if the log level is invalid
   */
  public async setLogLevel(logLevel: Input.LogLevel): Promise<void> {
    const ctx = new LogContext();

    const log = ctx.call({ methodName: this.setLogLevel.name });
    log.start({ logLevel });

    await this.waitUntilReady();

    Log.logLevel = logLevel || null;
    const args = { [bridgeArg.VALUE]: logLevel };

    try {
      await Adapty.callNative('set_log_level', args, ctx);

      log.success();
    } catch (nativeError) {
      const error = AdaptyError.tryWrap(nativeError);

      log.success({ error });
      throw error;
    }
  }

  /**
   * Sets the variation ID of the purchase.
   *
   * In Observer mode, Adapty SDK doesn't know, where the purchase was made from.
   * If you display products using our Paywalls or A/B Tests,
   * you can manually assign variation to the purchase.
   * After doing this, you'll be able to see metrics in Adapty Dashboard.
   *
   * @param {string} variationId - `variationId` property of {@link Model.AdaptyPaywall}
   * @param {string} transactionId - `transactionId` property of {@link Model.AdaptyPurchase}
   * @throws {@link AdaptyError}
   */
  public async setVariationId(
    variationId: string,
    transactionId: string,
  ): Promise<void> {
    const ctx = new LogContext();

    const log = ctx.call({ methodName: this.setVariationId.name });
    log.start({ variationId, transactionId });

    await this.waitUntilReady();

    const args = {
      [bridgeArg.VARIATION_ID]: variationId,
      [bridgeArg.TRANSACTION_ID]: transactionId,
    };

    try {
      await Adapty.callNative('set_variation_id', args, ctx);

      log.success();
    } catch (nativeError) {
      const error = AdaptyError.tryWrap(nativeError);

      log.success({ error });
      throw error;
    }
  }

  /**
   * Updates an attribution data for the current user.
   *
   * @example
   * ```ts
   * const attribution = {
   *   'Adjust Adid': 'adjust_adid',
   *   'Adjust Network': 'adjust_network',
   *   'Adjust Campaign': 'adjust_campaign',
   *   'Adjust Adgroup': 'adjust_adgroup',
   * };
   *
   * adapty.updateAttribution(attribution, 'adjust');
   * ```
   *
   * @param {Record<string | number, any>} attribution - An object containing attribution data.
   * @param {string} source - The source of the attribution data.
   * @param {string} [networkUserId] - The network user ID.
   * @returns {Promise<void>} A promise that resolves when the attribution data is updated.
   *
   * @throws {@link AdaptyError} Throws if parameters are invalid or not provided.
   */
  public async updateAttribution(
    attribution: Record<string, any>,
    source: Input.AttributionSource,
    networkUserId?: string,
  ): Promise<void> {
    const ctx = new LogContext();

    const log = ctx.call({ methodName: this.updateAttribution.name });
    log.start({ attribution, source, networkUserId });

    await this.waitUntilReady();

    let bridgeSource = source;
    if ((Input.AttributionSource as object).hasOwnProperty(source)) {
      bridgeSource =
        Input.AttributionSource[source as keyof typeof Input.AttributionSource];
    }

    let attributionData: any = attribution;
    if (Platform.OS === 'android') {
      // Android bridge handles objects poorly
      attributionData = JSON.stringify(attribution);
    }

    const args = {
      [bridgeArg.ATTRIBUTION]: attributionData,
      [bridgeArg.SOURCE]: bridgeSource,
      [bridgeArg.NETWORK_USER_ID]: networkUserId,
    };

    try {
      await Adapty.callNative('update_attribution', args, ctx);

      log.success();
    } catch (nativeError) {
      const error = AdaptyError.tryWrap(nativeError);

      log.success({ error });
      throw error;
    }
  }

  /**
   * Updates a profile for the current user.
   *
   * @param {Model.AdaptyProfileParameters} params — an object of parameters to update
   * @throws {@link AdaptyError} If parameters are invalid or there is a network error.
   *
   * @example
   * ```ts
   * const profile = {
   *  email: 'foo@example.com',
   * phone: '+1234567890',
   * };
   *
   * await adapty.updateProfile(profile);
   * ```
   */
  public async updateProfile(
    params: Partial<Model.AdaptyProfileParameters>,
  ): Promise<void> {
    const ctx = new LogContext();

    const log = ctx.call({ methodName: this.updateProfile.name });
    log.start({ params });

    await this.waitUntilReady();

    try {
      const data = new Coder.AdaptyProfileParametersCoder(params);
      const args = {
        [bridgeArg.PARAMS]: JSON.stringify(data.encode(ctx)),
      };

      await Adapty.callNative('update_profile', args, ctx);

      log.success();
    } catch (nativeError) {
      const error = AdaptyError.tryWrap(nativeError);

      log.success({ error });
      throw error;
    }
  }
}
