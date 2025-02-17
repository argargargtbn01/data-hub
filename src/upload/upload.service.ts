// src/upload/upload.service.ts (api-service)
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3 } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import * as amqp from 'amqplib';


@Injectable()
export class UploadService {
  private readonly s3: S3;

  constructor(
        private readonly configService: ConfigService,
        // @InjectQueue('file_processing_queue') private fileProcessingQueue: Queue //Sử dụng Bull,
        ) {
    this.s3 = new S3({
      accessKeyId: this.configService.get('aws.accessKeyId'),
      secretAccessKey: this.configService.get('aws.secretAccessKey'),
      region: this.configService.get('aws.region'),
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
      await this.s3.upload(params).promise();
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