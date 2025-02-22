import { Controller, Post, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { Multer } from 'multer';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}
  @Post()
  @UseInterceptors(FileInterceptor('file')) // "file" là tên của trường trong form-data
  async uploadFile(@UploadedFile() file: Multer.File) {
    return this.uploadService.uploadFile(file);
  }
}
