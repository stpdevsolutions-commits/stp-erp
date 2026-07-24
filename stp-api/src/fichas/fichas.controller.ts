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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ScopedResource } from '../common/decorators/scoped-resource.decorator';
import { ResourceAccessGuard } from '../common/guards/resource-access.guard';
import { User } from '../users/entities/user.entity';
import { FichasService } from './fichas.service';
import { CreateFichaDto } from './dto/create-ficha.dto';
import { UpdateFichaDto } from './dto/update-ficha.dto';
import { QueryFichasDto } from './dto/query-fichas.dto';

@ApiTags('fichas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ResourceAccessGuard)
@Controller('fichas')
export class FichasController {
  constructor(private readonly fichasService: FichasService) {}

  @Post()
  @ScopedResource({ kind: 'project', param: 'projectId', in: 'body' })
  create(@Body() dto: CreateFichaDto, @CurrentUser() user: User) {
    return this.fichasService.create(dto, user);
  }

  @Get()
  findAll(@Query() query: QueryFichasDto, @CurrentUser() user: User) {
    return this.fichasService.findAll(query, user);
  }

  @Get(':id')
  @ScopedResource('ficha')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.fichasService.findOne(id, user);
  }

  @Patch(':id')
  @ScopedResource('ficha')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFichaDto,
    @CurrentUser() user: User,
  ) {
    return this.fichasService.update(id, dto, user);
  }

  @Post(':id/submit')
  @ScopedResource('ficha')
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.fichasService.submit(id, user);
  }

  @Delete(':id')
  @ScopedResource('ficha')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.fichasService.remove(id, user);
  }

  @Get(':id/pdf')
  @ScopedResource('ficha')
  async getPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const html = await this.fichasService.getPdfHtml(id, user);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="ficha-${id}.html"`);
    res.send(html);
  }
}
