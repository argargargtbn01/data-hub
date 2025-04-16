import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('vector_chunk')
export class VectorChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', nullable: false })
  botId: number;

  @Column({ type: 'varchar', nullable: false })
  documentId: string;

  @Column({ type: 'varchar', nullable: true })
  filename: string;

  @Column({ type: 'text', nullable: false })
  text: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column('float', { array: true, nullable: false })
  embedding: number[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}