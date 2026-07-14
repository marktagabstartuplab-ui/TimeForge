import { Global, Module } from '@nestjs/common';
import { DepartmentScopeService } from './department-scope.service';

/**
 * Global module exposing department-based supervision scoping so every feature
 * module can inject {@link DepartmentScopeService} without re-importing it.
 * Mirrors the global PrismaModule pattern.
 */
@Global()
@Module({
  providers: [DepartmentScopeService],
  exports: [DepartmentScopeService],
})
export class ScopingModule {}
