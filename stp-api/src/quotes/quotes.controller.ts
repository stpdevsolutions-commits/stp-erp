import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { CreateQuoteItemDto } from './dto/create-quote-item.dto';
import { UpdateQuoteItemDto } from './dto/update-quote-item.dto';
import { QueryQuotesDto } from './dto/query-quotes.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

interface AuthUser { id: string; role: UserRole; }

@Controller('quotes')
@UseGuards(JwtAuthGuard)
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  create(@Body() dto: CreateQuoteDto, @CurrentUser() user: AuthUser) {
    return this.quotesService.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: QueryQuotesDto) {
    return this.quotesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.findOne(id);
  }

  @Get(':id/pdf-file')
  async getPdfFile(@Param('id', ParseUUIDPipe) id: string) {
    const file = await this.quotesService.findPdfFile(id);
    if (!file) throw new NotFoundException('PDF no disponible todavía');
    return file;
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuoteDto, @CurrentUser() user: AuthUser) {
    return this.quotesService.update(id, dto, user.role);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.remove(id);
  }

  // ── Items ──────────────────────────────────────────────────────────────────

  @Post(':id/items')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateQuoteItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotesService.addItem(id, dto, user.role);
  }

  @Patch(':id/items/:itemId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateQuoteItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotesService.updateItem(id, itemId, dto, user.role);
  }

  @Delete(':id/items/:itemId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotesService.removeItem(id, itemId, user.role);
  }
}
