declare module "qrcode" {
  type QRCodeToDataURLOptions = {
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    margin?: number;
    scale?: number;
    type?: "image/png" | "image/jpeg" | "image/webp";
  };

  const QRCode: {
    toDataURL(
      data: string,
      options?: QRCodeToDataURLOptions
    ): Promise<string>;
  };

  export default QRCode;
}
