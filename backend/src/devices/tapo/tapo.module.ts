import { Module } from '@nestjs/common';
import { TapoController } from './tapo.controller';
import { TapoService } from './tapo.service';

@Module({
  controllers: [TapoController],
  providers: [TapoService],
})
export class TapoModule {}
