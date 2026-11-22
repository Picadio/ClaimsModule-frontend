
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpEventType, HttpResponse } from '@angular/common/http';
import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { filter, finalize, map, tap } from 'rxjs';
import { ClaimsApi } from '../../core/claims-api';
import { ClaimDocument } from '../../core/contracts';
import { Session } from '../../core/session';
import { Feedback } from '../../shared/feedback';
import { Operation } from '../../shared/operation';

const maxBytes = 50 * 1024 * 1024;
const allowedFile = /\.(pdf|jpe?g|png|docx|xlsx|txt|csv)$/i;

@Component({
  selector: 'app-documents-tab',
  imports: [
    DatePipe, DecimalPipe, ReactiveFormsModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatProgressBarModule, Feedback,
  ],
  templateUrl: './documents-tab.html',
})
export class DocumentsTab implements OnInit {
  readonly claimId = input.required<string>();
  readonly relatedId = input<string | null>(null);
  readonly changed = output<void>();
  private readonly api = inject(ClaimsApi);
  protected readonly session = inject(Session);
  protected readonly read = new Operation();
  protected readonly uploadTask = new Operation();
  protected readonly downloadTask = new Operation();
  protected readonly documents = signal<ClaimDocument[] | null>(null);
  protected readonly file = signal<File | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly progress = signal<number | null>(null);
  protected readonly uploaded = signal('');
  protected readonly downloadLink = signal<{ url: string; filename: string } | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({ type: ['Other'], notes: [''] });

  ngOnInit(): void {
    this.refresh();
  }

  protected refresh(): void {
    this.read.run(this.api.documents(this.claimId()), documents => this.documents.set(documents));
  }

  protected choose(input: HTMLInputElement): void {
    this.uploaded.set('');
    const file = input.files?.[0] ?? null;
    this.file.set(null);
    this.fileError.set(null);
    if (!file) return;
    if (!allowedFile.test(file.name) || !file.size || file.size > maxBytes) {
      this.fileError.set('Choose a nonempty PDF, JPEG, PNG, DOCX, XLSX, TXT or CSV file up to 50 MiB.');
      input.value = '';
      return;
    }
    this.file.set(file);
  }

  protected upload(input: HTMLInputElement): void {
    const file = this.file();
    const form = this.form.getRawValue();
    if (!file || !form.type.trim() || this.uploadTask.pending() || this.read.pending()) return;
    this.progress.set(null);
    this.uploaded.set('');
    const request = this.api.upload(this.claimId(), file, form.type.trim(), form.notes.trim()).pipe(
      tap(event => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.progress.set(Math.round(event.loaded / event.total * 100));
        }
      }),
      filter((event): event is HttpResponse<ClaimDocument> => event.type === HttpEventType.Response),
    );
    this.uploadTask.run(request, response => {
      this.uploaded.set(response.body?.fileName ?? file.name);
      this.file.set(null);
      input.value = '';
      this.form.reset();
      this.refresh();
      this.changed.emit();
    });
  }

  protected download(entry: ClaimDocument): void {
    if (this.downloadTask.pending()) return;
    this.downloadLink.set(null);
    const localPath = '/api/claims/' + this.claimId() + '/documents/' + entry.id + '/download';
    if (entry.downloadUrl === localPath) {
      this.downloadTask.run(this.api.downloadLocal(this.claimId(), entry.id), blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = entry.fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      });
      return;
    }

    if (!entry.downloadUrl?.startsWith('https://')) return;
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    let navigated = false;
    this.downloadTask.run(this.api.documents(this.claimId()).pipe(
      map(documents => {
        const url = documents.find(candidate => candidate.id === entry.id)?.downloadUrl;
        if (!url || new URL(url).protocol !== 'https:') throw new Error('A download link is unavailable.');
        return url;
      }),
      finalize(() => { if (!navigated) tab?.close(); }),
    ), url => {
      if (tab && !tab.closed) {
        tab.location.replace(url);
        navigated = true;
      } else {
        this.downloadLink.set({ url, filename: entry.fileName });
      }
    });
  }
}
