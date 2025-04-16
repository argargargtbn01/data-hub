import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VectorStoreController } from './vector-store.controller';
import { VectorStoreService } from './vector-store.service';
import { VectorChunk } from '../entities/vector-chunk.entity';
import { EmbeddingModule } from '../embedding/embedding.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VectorChunk]),
    EmbeddingModule
  ],
  controllers: [VectorStoreController],
  providers: [VectorStoreService],
  exports: [VectorStoreService]
})
export class VectorStoreModule {}