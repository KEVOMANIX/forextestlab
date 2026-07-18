declare module "@paystack/inline-js" {
  interface PaystackTransactionResult {
    reference: string;
  }

  interface PaystackPopupError {
    message?: string;
  }

  interface PaystackResumeOptions {
    onSuccess?: (transaction: PaystackTransactionResult) => void;
    onCancel?: () => void;
    onLoad?: () => void;
    onError?: (error: PaystackPopupError) => void;
  }

  export default class PaystackPop {
    resumeTransaction(accessCode: string, options?: PaystackResumeOptions): unknown;
  }
}
