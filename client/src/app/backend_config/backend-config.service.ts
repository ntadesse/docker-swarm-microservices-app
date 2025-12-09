import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class BackendConfigService {
    
    // Use nginx proxy routes when running in Docker
    backend_url = window.location.origin + '/';

    javaport='9000';
    nodeport='5000';
    angularport='4200';
  constructor() { }
}
