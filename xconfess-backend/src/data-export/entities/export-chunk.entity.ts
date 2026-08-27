// src/data-export/entities/export-chunk.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ExportRequest } from './export-request.entity';

@Entity('export_chunks')
export class ExportChunk {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ExportRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'export_request_id' })
  @Index()
  exportRequest!: ExportRequest;

  @Column({ name: 'export_request_id' })
  exportRequestId!: string;

  @Column()
  chunkIndex!: number;

  @Column({ type: 'bytea' })
  fileData!: Buffer;

  @Column()
  chunkSize!: number;

  @Column()
  checksum!: string; // SHA-256 of this chunk
}
