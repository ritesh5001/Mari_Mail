import { SES, SendRawEmailCommand } from "@aws-sdk/client-ses";
import nodemailer, { type Transporter } from "nodemailer";

export type SesCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

export function buildSesTransport(creds: SesCredentials): Transporter {
  const ses = new SES({
    region: creds.region,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    },
  });

  return nodemailer.createTransport({ SES: { ses, aws: { SendRawEmailCommand } } });
}
