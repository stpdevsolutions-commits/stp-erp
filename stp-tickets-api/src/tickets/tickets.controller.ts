import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { QueryTicketsDto } from './dto/query-tickets.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { AgentKeyGuard } from '../common/agent-key.guard';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  findAll(@Query() query: QueryTicketsDto) {
    return this.tickets.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tickets.findOne(id);
  }

  @UseGuards(AgentKeyGuard)
  @Post()
  create(@Body() dto: CreateTicketDto) {
    return this.tickets.create(dto);
  }

  @UseGuards(AgentKeyGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.tickets.update(id, dto);
  }

  @UseGuards(AgentKeyGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tickets.remove(id);
  }

  @Get(':id/comments')
  listComments(@Param('id') id: string) {
    return this.tickets.listComments(id);
  }

  @UseGuards(AgentKeyGuard)
  @Post(':id/comments')
  addComment(@Param('id') id: string, @Body() dto: CreateCommentDto) {
    return this.tickets.addComment(id, dto);
  }
}
