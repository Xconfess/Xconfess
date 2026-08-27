import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import {
  Notification,
  NotificationType,
} from '../entities/notification.entity';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { NotificationJobData } from '../processors/notification.processor';

@Injectable()
export class EmailNotificationService {
  private readonly logger = new Logger(EmailNotificationService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private configService: ConfigService,
    @InjectRepository(NotificationPreference)
    private preferenceRepository: Repository<NotificationPreference>,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT'),
      secure: this.configService.get<string>('SMTP_SECURE') === 'true',
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendEmail(data: NotificationJobData) {
    const userId = data.userId;
    const preference = await this.preferenceRepository.findOne({
      where: { userId },
    });

    if (
      !preference ||
      !preference.enableEmailNotifications ||
      !preference.emailAddress
    ) {
      this.logger.log(`Email notifications disabled for user ${userId}`);
      return;
    }

    if (
      data.type === NotificationType.NEW_MESSAGE &&
      !preference.emailNewMessage
    ) {
      this.logger.log(
        `New message email notifications disabled for user ${userId}`,
      );
      return;
    }

    if (
      data.type === NotificationType.MESSAGE_BATCH &&
      !preference.emailMessageBatch
    ) {
      this.logger.log(
        `Batch message email notifications disabled for user ${userId}`,
      );
      return;
    }

    const mockNotification = {
      id: data._meta?.originalJobId || 'job-' + Date.now(),
      type: data.type,
      userId: userId,
      title: data.title,
      message: data.message,
      metadata: data.metadata,
    } as Notification;

    await this.sendNotificationEmail(mockNotification, preference.emailAddress);
  }

  async sendNotificationEmail(
    notification: Notification,
    recipientEmail: string,
  ): Promise<void> {
    try {
      const { subject, html, text } = this.buildEmailContent(notification);

      await this.transporter.sendMail({
        from: this.configService.get<string>('SMTP_FROM_EMAIL'),
        to: recipientEmail,
        subject,
        html,
        text,
      });

      this.logger.log(`Email sent for notification ${notification.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to send email for notification ${notification.id}:`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private buildEmailContent(notification: Notification): {
    subject: string;
    html: string;
    text: string;
  } {
    const appUrl = (this.configService.get<string>('APP_URL') as string) || '';

    switch (notification.type) {
      case NotificationType.NEW_MESSAGE:
        return {
          subject: 'New Message on xConfess',
          html: this.buildNewMessageEmail(notification, appUrl),
          text: `You have a new message on xConfess: ${notification.message}`,
        };

      case NotificationType.MESSAGE_BATCH:
        return {
          subject: `${notification.metadata?.messageCount || 'Multiple'} New Messages on xConfess`,
          html: this.buildBatchMessageEmail(notification, appUrl),
          text: `You have ${notification.metadata?.messageCount || 'multiple'} new messages on xConfess.`,
        };

      default:
        return {
          subject: notification.title,
          html: this.buildGenericEmail(notification),
          text: notification.message,
        };
    }
  }

  private buildNewMessageEmail(
    notification: Notification,
    appUrl: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .message-preview { background: white; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; border-radius: 4px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔔 New Message</h1>
            </div>
            <div class="content">
              <p>You've received a new anonymous message on xConfess!</p>
              
              <div class="message-preview">
                <p>${this.escapeHtml(notification.message)}</p>
              </div>
              
              <a href="${appUrl}/messages" class="button">View Message</a>
              
              <p style="margin-top: 30px; font-size: 14px; color: #666;">
                You're receiving this email because you have email notifications enabled for new messages.
                <a href="${appUrl}/settings/notifications">Update your notification preferences</a>
              </p>
            </div>
            <div class="footer">
              <p>xConfess - Anonymous Confessions on the Blockchain</p>
              <p>&copy; ${new Date().getFullYear()} xConfess. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private buildBatchMessageEmail(
    notification: Notification,
    appUrl: string,
  ): string {
    const count = notification.metadata?.messageCount || 0;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .message-count { background: white; padding: 40px; text-align: center; margin: 20px 0; border-radius: 8px; }
            .count-number { font-size: 48px; font-weight: bold; color: #667eea; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>💬 New Messages</h1>
            </div>
            <div class="content">
              <p>You've received multiple messages on xConfess!</p>
              
              <div class="message-count">
                <div class="count-number">${count}</div>
                <p style="margin: 10px 0 0 0; color: #666;">Unread Messages</p>
              </div>
              
              <a href="${appUrl}/messages" class="button">View All Messages</a>
              
              <p style="margin-top: 30px; font-size: 14px; color: #666;">
                You're receiving this email because you have email notifications enabled.
                <a href="${appUrl}/settings/notifications">Update your notification preferences</a>
              </p>
            </div>
            <div class="footer">
              <p>xConfess - Anonymous Confessions on the Blockchain</p>
              <p>&copy; ${new Date().getFullYear()} xConfess. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private buildGenericEmail(notification: Notification): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${this.escapeHtml(notification.title)}</h1>
            </div>
            <div class="content">
              <p>${this.escapeHtml(notification.message)}</p>
            </div>
            <div class="footer">
              <p>xConfess - Anonymous Confessions on the Blockchain</p>
              <p>&copy; ${new Date().getFullYear()} xConfess. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m] || m);
  }
}
