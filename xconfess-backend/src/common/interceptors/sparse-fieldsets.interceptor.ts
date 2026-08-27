import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class SparseFieldsetsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const fieldsQuery = request.query.fields;

    return next.handle().pipe(
      map((data) => {
        if (!fieldsQuery || !data) {
          return data;
        }

        const fields = String(fieldsQuery)
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean);

        if (fields.length === 0) {
          return data;
        }

        return this.filterFields(data, fields);
      }),
    );
  }

  private filterFields(data: any, fields: string[]): any {
    if (Array.isArray(data)) {
      return data.map((item) => this.filterObject(item, fields));
    }

    if (data && typeof data === 'object') {
      if (Array.isArray(data.data)) {
        return {
          ...data,
          data: data.data.map((item: any) => this.filterObject(item, fields)),
        };
      }
      return this.filterObject(data, fields);
    }

    return data;
  }

  private filterObject(obj: any, fields: string[]): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const filtered: any = {};
    for (const field of fields) {
      if (field.includes('.')) {
        const parts = field.split('.');
        const first = parts[0];
        const rest = parts.slice(1).join('.');
        if (obj[first] !== undefined) {
          filtered[first] = this.filterObject(obj[first], [rest]);
        }
      } else if (obj[field] !== undefined) {
        filtered[field] = obj[field];
      }
    }
    return filtered;
  }
}
