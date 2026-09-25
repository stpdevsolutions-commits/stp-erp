import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SearchService, type SearchResponse } from './search.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

const EMPTY: SearchResponse = { clients: [], projects: [], quotes: [], tasks: [], files: [], collaborators: [] };

// Sin @RequireModule a nivel de clase a propósito: cualquier autenticado
// puede llamar el endpoint, pero SearchService apaga cada categoría por
// separado según el módulo al que el rol tenga acceso — el gate real vive
// ahí, no aquí (ver comentario en search.service.ts).
@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@Query('q') q: string | undefined, @CurrentUser() user: AuthUser): Promise<SearchResponse> | SearchResponse {
    const term = q?.trim();
    if (!term || term.length < 2) return EMPTY;
    return this.searchService.search(term, user);
  }
}
