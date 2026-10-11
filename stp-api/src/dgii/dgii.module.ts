import { Module } from '@nestjs/common';
import { DgiiService } from './dgii.service';
import { DgiiController } from './dgii.controller';

@Module({
  providers: [DgiiService],
  controllers: [DgiiController],
  exports: [DgiiService],
})
export class DgiiModule {}
