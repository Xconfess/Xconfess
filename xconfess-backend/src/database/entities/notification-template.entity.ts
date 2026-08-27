import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne } from 'typeorm';
import {TemplateVersion} from './template-version.entity';

@Entity('notification_templates')
export class NotificationTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  templateKey: string; // e.g., 'NEW_COMMENT'

  @Column()
  type: 'email' | 'push' | 'in-app';

  @Column()
  category: 'system' | 'user_interaction' | 'marketing';

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => TemplateVersion, (version) => version.template)
  versions: TemplateVersion[];

  @ManyToOne(() => TemplateVersion, { nullable: true })
  currentVersion: TemplateVersion;
}