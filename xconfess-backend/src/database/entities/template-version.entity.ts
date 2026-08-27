import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { NotificationTemplate } from './notification-template.entity';

@Entity('template_versions')
export class TemplateVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  content: string; // Template string with {{variables}}

  @Column()
  versionNumber: number;

  @ManyToOne(() => NotificationTemplate, (template) => template.versions)
  template: NotificationTemplate;

  @CreateDateColumn()
  createdAt: Date;
}