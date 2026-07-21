import QRCode from "qrcode";

export async function generateQRCode(data: string): Promise<string> {
  return QRCode.toDataURL(data, {
    errorCorrectionLevel: "H",
    margin: 3,
    scale: 10,
    type: "image/png",
  });
}
