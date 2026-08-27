import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditActionType } from '../../audit-log/audit-log.entity';
import { RequestUser } from '../../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../../user/entities/user.entity';
import { StellarConfigService } from '../stellar-config.service';
import {
  getMatchingStellarInvocationScope,
  getStellarInvocationPolicy,
  hasAnyStellarInvocationScope,
} from '../stellar-invocation-policy';
import {
  buildAuditContextFromRequest,
  buildStellarInvocationAuditMetadata,
} from '../stellar-invocation-audit';

type AuthenticatedRequest = Request & {
  body?: {
    operation?: string;
    sourceAccount?: string;
  };
  requestId?: string;
  stellarInvocationScopeMatch?: string;
  user?: RequestUser;
};

@Injectable()
export class StellarInvokeContractGuard implements CanActivate {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly stellarConfig: StellarConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    const scopes = user?.scopes ?? [];
    const operation =
      typeof request.body?.operation === 'string' ? request.body.operation : null;
    const policy = getStellarInvocationPolicy(operation);
    const matchedScope = getMatchingStellarInvocationScope(operation, scopes);

    if (!user) {
      throw new ForbiddenException('User is not authenticated');
    }

    const userRole = String(user.role || '').toLowerCase();
    const isAdmin = userRole === UserRole.ADMIN || userRole === 'admin';

    if (!isAdmin) {
      await this.auditDeniedInvocation(request, {
        operation,
        allowlistClass: policy?.allowlistClass,
        contractId: this.getContractIdSafely(policy?.contractName),
        functionName: policy?.functionName,
        sourceAccount:
          typeof request.body?.sourceAccount === 'string'
            ? request.body.sourceAccount
            : null,
        outcome: 'denied',
        denialReason: 'admin_role_required',
        requiredScopes: policy?.allowedScopes,
      });
      throw new ForbiddenException('Only admins can access this endpoint');
    }

    if (policy && matchedScope) {
      request.stellarInvocationScopeMatch = matchedScope;
      return true;
    }

    if (!policy && hasAnyStellarInvocationScope(scopes)) {
      if (matchedScope) {
        request.stellarInvocationScopeMatch = matchedScope;
      }
      return true;
    }

    await this.auditDeniedInvocation(request, {
      operation,
      allowlistClass: policy?.allowlistClass,
      contractId: this.getContractIdSafely(policy?.contractName),
      functionName: policy?.functionName,
      sourceAccount:
        typeof request.body?.sourceAccount === 'string'
          ? request.body.sourceAccount
          : null,
      outcome: 'denied',
      denialReason: policy ? 'operation_scope_denied' : 'scope_required',
      requiredScopes: policy?.allowedScopes,
    });

    if (policy) {
      throw new ForbiddenException(
        `Missing required Stellar scope for operation: ${policy.operation}`,
      );
    }

    throw new ForbiddenException(
      'Missing required Stellar contract invocation scope',
    );
  }

  private getContractIdSafely(
    contractName?: 'confessionAnchor' | 'reputationBadges' | 'tippingSystem',
  ): string | null {
    if (!contractName) {
      return null;
    }

    try {
      return this.stellarConfig.getContractId(contractName);
    } catch {
      return null;
    }
  }

  private async auditDeniedInvocation(
    request: AuthenticatedRequest,
    options: Parameters<typeof buildStellarInvocationAuditMetadata>[0],
  ): Promise<void> {
    await this.auditLogService.log({
      actionType: AuditActionType.STELLAR_CONTRACT_INVOCATION,
      context: buildAuditContextFromRequest(request),
      metadata: {
        ...buildStellarInvocationAuditMetadata(options),
        actorUserId: request.user?.id,
      },
    });
  }
}
