import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialCalc } from './entities/material-calc.entity';
import { CalcMaterialLink } from './entities/calc-material-link.entity';
import { Project } from '../projects/entities/project.entity';
import { CostsModule } from '../costs/costs.module';
import { FilesModule } from '../files/files.module';
import { SettingsModule } from '../settings/settings.module';
import { MaterialCalcsService } from './material-calcs.service';
import { MaterialCalcsController } from './material-calcs.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MaterialCalc, CalcMaterialLink, Project]),
    CostsModule,
    FilesModule,
    SettingsModule,
  ],
  controllers: [MaterialCalcsController],
  providers: [MaterialCalcsService],
})
export class MaterialCalcsModule {}
