import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { dirname, join } from 'path';

export interface IFileStorageService {
  upload(key: string, body: Buffer, contentType: string): Promise<{ key: string }>;
  presignedGetUrl(key: string, expiresSec?: number): Promise<string>;
  getObject(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

// S3-compatible storage (Cloudflare R2 / Backblaze B2 / AWS S3) with a local-disk fallback for dev.
// Downloads use short-TTL presigned URLs (least privilege). Provider = STORAGE_PROVIDER (r2|s3|local).
@Injectable()
export class StorageService implements IFileStorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly provider: string;
  private readonly bucket: string;
  private readonly s3?: S3Client;

  constructor(private readonly config: ConfigService) {
    this.provider = config.get('STORAGE_PROVIDER', 'local');
    this.bucket = config.get('S3_BUCKET', 'lead360-documents');
    if (this.provider !== 'local') {
      this.s3 = new S3Client({
        region: config.get('S3_REGION', 'auto'),
        endpoint: config.get('S3_ENDPOINT'),
        credentials: {
          accessKeyId: config.get('S3_ACCESS_KEY_ID', ''),
          secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', ''),
        },
      });
    } else {
      this.logger.warn('STORAGE_PROVIDER=local — files are written to ./uploads (dev only).');
    }
  }

  async upload(key: string, body: Buffer, contentType: string) {
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
      );
    } else {
      const path = join(process.cwd(), 'uploads', key);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, body);
    }
    return { key };
  }

  async presignedGetUrl(key: string, expiresSec = 300): Promise<string> {
    if (this.s3) {
      return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
        expiresIn: expiresSec,
      });
    }
    return `/uploads/${key}`;
  }

  // Read a stored object back as a Buffer (used to stream downloads/views through the API).
  async getObject(key: string): Promise<Buffer> {
    if (this.s3) {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await res.Body!.transformToByteArray();
      return Buffer.from(bytes);
    }
    return readFileSync(join(process.cwd(), 'uploads', key));
  }

  async delete(key: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } else {
      rmSync(join(process.cwd(), 'uploads', key), { force: true }); // force: no error if already gone
    }
  }
}
