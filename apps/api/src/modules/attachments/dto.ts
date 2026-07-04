import { IsEnum, IsString, IsUrl, MaxLength } from 'class-validator';

/** Link-type attachments only — FILE attachments go through the multipart endpoint. */
export class CreateAttachmentLinkDto {
  @IsEnum(['GITHUB', 'FIGMA', 'PR', 'GOOGLE_DOCS', 'OTHER_LINK'] as const)
  type!: 'GITHUB' | 'FIGMA' | 'PR' | 'GOOGLE_DOCS' | 'OTHER_LINK';

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsUrl()
  url!: string;
}

export class CreateAttachmentFileMetaDto {
  @IsString()
  @MaxLength(200)
  name!: string;
}
