import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CookieJwtGuard } from '../../common/cookie-jwt.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { ProjectsService } from './projects.service';

class UpsertProjectDto {
  @IsOptional()
  @IsString()
  docTitle?: string;

  @IsOptional()
  @IsObject()
  formFields?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  minutesText?: string;
}

class ProjectListQuery {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @IsIn([12, 24, 48])
  pageSize?: number;
}

@Controller('projects')
@UseGuards(CookieJwtGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() body: UpsertProjectDto) {
    return this.projectsService.create(user.userId, body);
  }

  @Get()
  list(
    @CurrentUser() user: { userId: string },
    @Query() query: ProjectListQuery,
  ) {
    if (!query.page && !query.pageSize) {
      return this.projectsService.list(user.userId);
    }
    return this.projectsService.listPage(user.userId, query.page, query.pageSize);
  }

  @Get(':id')
  get(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.projectsService.getById(user.userId, id);
  }

  @Get(':id/versions/:ver')
  getVersion(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('ver') ver: string,
  ) {
    return this.projectsService.getVersion(user.userId, id, Number(ver));
  }

  @Put(':id')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: UpsertProjectDto,
  ) {
    return this.projectsService.update(user.userId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.projectsService.hardDelete(user.userId, id);
  }
}
