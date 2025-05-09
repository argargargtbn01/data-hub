// src/upload/upload.service.ts (api-service)
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import * as amqp from 'amqplib';
import { Express } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';

@Injectable()
export class UploadService {
  private readonly s3Client: S3Client;
  private readonly logger = new Logger(UploadService.name);
  private readonly processingJobUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get('aws.accessKeyId'),
        secretAccessKey: this.configService.get('aws.secretAccessKey'),
      },
    });

    // URL của data-processing-job service
    this.processingJobUrl =
      this.configService.get<string>('PROCESSING_JOB_URL') || 'http://localhost:3001';
  }

  async uploadFile(file: Express.Multer.File): Promise<{ fileId: string }> {
    const fileId = uuidv4();
    const key = `uploads/${fileId}/${file.originalname}`;

    const params = {
      Bucket: this.configService.get('aws.s3BucketName'),
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    try {
      // Tải lên S3
      this.logger.log(`Uploading file ${file.originalname} to S3...`);
      const command = new PutObjectCommand(params);
      await this.s3Client.send(command);
      this.logger.log(`File uploaded successfully to S3 with key: ${key}`);

      // Xử lý đồng bộ thông qua API thay vì qua queue
      const useSyncProcessing = true; // Có thể đặt thành cấu hình

      if (useSyncProcessing) {
        // Gọi API xử lý đồng bộ
        await this.processFileSynchronously(fileId, key, file.originalname, file.mimetype);
      } else {
        // Hoặc gửi vào queue nếu muốn xử lý bất đồng bộ
        await this.sendToRabbitMQ(fileId, key);
      }

      return { fileId };
    } catch (error) {
      this.logger.error(`Error uploading or processing file: ${error.message}`);
      throw new Error(`Failed to upload or process file: ${error.message}`);
    }
  }

  /**
   * Xử lý file đồng bộ thông qua API của data-processing-job
   */
  private async processFileSynchronously(
    fileId: string,
    s3Key: string,
    filename: string,
    mimeType: string,
  ): Promise<void> {
    try {
      this.logger.log(`Processing file ${filename} synchronously...`);

      // 1. Đầu tiên tạo bản ghi document trong cơ sở dữ liệu
      const documentData = {
        id: fileId,
        botId: 1, // Hoặc lấy từ request
        filename: filename,
        s3Key: s3Key,
        mimeType: mimeType,
        status: 'Uploaded',
      };

      // Lưu document vào database
      const documentResponse = await axios.post(`${this.processingJobUrl}/document`, documentData, {
        headers: { 'Content-Type': 'application/json' },
      });

      const documentId = documentResponse.data.id;
      this.logger.log(`Document created with ID: ${documentId}`);

      // 2. Gọi API xử lý đồng bộ
      const processingResponse = await axios.post(
        `${this.processingJobUrl}/document-processing/sync/${documentId}`,
        {},
        { headers: { 'Content-Type': 'application/json' } },
      );

      this.logger.log(`Synchronous processing result: ${JSON.stringify(processingResponse.data)}`);
    } catch (error) {
      this.logger.error(`Error in synchronous processing: ${error.message}`);
      if (error.response) {
        this.logger.error(`API response error: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  private async sendToRabbitMQ(fileId: string, s3Key: string) {
    try {
      const connection = await amqp.connect(this.configService.get('rabbitmq.url'));
      const channel = await connection.createChannel();
      const queue = this.configService.get('rabbitmq.fileProcessingQueue');

      await channel.assertQueue(queue, { durable: true });

      const message = { fileId, s3Key };
      channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });

      this.logger.log(`Sent message to queue ${queue}: ${JSON.stringify(message)}`);

      await channel.close();
      await connection.close();
    } catch (error) {
      this.logger.error(`Error sending message to RabbitMQ: ${error.message}`);
      throw error;
    }
  }
}
