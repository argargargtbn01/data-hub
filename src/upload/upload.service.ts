// src/upload/upload.service.ts (api-service)
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import * as amqp from 'amqplib';
import { Express } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
@Injectable()
export class UploadService {
  private readonly s3Client: S3Client;

  constructor(private readonly configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get('aws.accessKeyId'),
        secretAccessKey: this.configService.get('aws.secretAccessKey'),
      },
    });
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
      const command = new PutObjectCommand(params);
      await this.s3Client.send(command);
      // Gửi message vào RabbitMQ
      await this.sendToRabbitMQ(fileId, key);

      return { fileId };
    } catch (error) {
      console.error('Error uploading file to S3:', error);
      throw new Error('Failed to upload file');
    }
  }

  private async sendToRabbitMQ(fileId: string, s3Key: string) {
    const connection = await amqp.connect(this.configService.get('rabbitmq.url'));
    const channel = await connection.createChannel();
    const queue = this.configService.get('rabbitmq.fileProcessingQueue');

    await channel.assertQueue(queue, { durable: true });

    const message = { fileId, s3Key };
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true }); // Đảm bảo message không bị mất khi RabbitMQ restart

    console.log(`Sent message to queue ${queue}:`, message);

    await channel.close();
    await connection.close();
  }
}
