import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VectorStoreModule } from '../vector-store/vector-store.module';
import { RetrievalService } from './retrieval.service';
import { RetrievalController } from './retrieval.controller';

@Module({
  imports: [VectorStoreModule, ConfigModule],
  controllers: [RetrievalController],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}