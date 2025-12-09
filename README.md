# Microservice Deployment on Docker Swarm

## Table of Contents
1. [Docker Swarm Cluster Setup with MicroCeph](#1-docker-swarm-cluster-setup-with-microceph)
2. [Portainer - Container Management](#2-portainer---container-management)
3. [Monitoring Stack - Prometheus, Grafana, Node Exporter, cAdvisor](#3-monitoring-stack---prometheus-grafana-node-exporter-cadvisor)
4. [Logging Stack - EFK (Elasticsearch, Fluent-Bit, Kibana)](#4-logging-stack---efk-elasticsearch-fluent-bit-kibana)
5. [Private Registry Architecture (Nexus + Nginx)](#5-private-registry-architecture-nexus--nginx)
6. [SSL Certificate Generation and Trust Setup](#6-ssl-certificate-generation-and-trust-setup)
7. [Microservice - Docker Containerization](#7-microservice---docker-containerization)
8. [Docker Swarm Deployment Procedure](#8-docker-swarm-deployment-procedure)


## 1. Docker Swarm Cluster Setup with MicroCeph

### Cluster Architecture
- 5-Node Docker Swarm Cluster
- 3 Manager+Worker Nodes (manager1, manager2, manager3)
- 2 Worker Nodes (worker1, worker2)
- 1 Separate Registry VM (CentOS) - Nexus + Nginx
- MicroCeph distributed storage for shared volumes
- CephFS mounted at /mnt/cephfs/ on all nodes

### Architecture Diagram

```
                    ┌────────────────────────────┐
                    │   REGISTRY VM (CentOS)     │
                    │   <host-ip>            │
                    │                            │
                    │  ┌──────────────────────┐  │
                    │  │   Nexus Repository   │  │
                    │  │   + Nginx (SSL)      │  │
                    │  │   Port: 443          │  │
                    │  └──────────────────────┘  │
                    └────────────────────────────┘
                                 │
                                 │ HTTPS
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DOCKER SWARM CLUSTER (5 NODES)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                       │
│  │  Manager 1   │  │  Manager 2   │  │  Manager 3   │                       │
│  │  + Worker    │  │  + Worker    │  │  + Worker    │                       │
│  │              │  │              │  │              │                       │
│  │ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐ │                       │
│  │ │Portainer │ │  │ │ Grafana  │ │  │ │Prometheus│ │                       │
│  │ │          │ │  │ │          │ │  │ │          │ │                       │
│  │ └──────────┘ │  │ └──────────┘ │  │ └──────────┘ │                       │
│  │              │  │              │  │              │                       │
│  │ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐ │                       │
│  │ │ MongoDB  │ │  │ │  MySQL   │ │  │ │   EFK    │ │                       │
│  │ └──────────┘ │  │ └──────────┘ │  │ └──────────┘ │                       │
│  └──────────────┘  └──────────────┘  └──────────────┘                       │
│         │                  │                  │                             │
│         └──────────────────┼──────────────────┘                             │
│                            │                                                │
│  ┌──────────────┐  ┌──────────────┐                                         │
│  │   Worker 1   │  │   Worker 2   │                                         │
│  │              │  │              │                                         │
│  │ ┌──────────┐ │  │ ┌──────────┐ │                                         │
│  │ │ EmartApp │ │  │ │ EmartApp │ │                                         │
│  │ │ Services │ │  │ │ Services │ │                                         │
│  │ └──────────┘ │  │ └──────────┘ │                                         │
│  └──────────────┘  └──────────────┘                                         │
│         │                  │                                                │
│         └──────────────────┘                                                │
└─────────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
              ┌────────────────────────────────┐
              │   MICROCEPH CLUSTER (CephFS)   │
              │   Shared Storage Layer         │
              │   /mnt/cephfs/                 │
              │                                │
              │  • MongoDB Data                │
              │  • MySQL Data                  │
              │  • Portainer Data              │
              │  • Prometheus Data             │
              │  • Grafana Data                │
              │  • Elasticsearch Data          │
              └────────────────────────────────┘
```

### Component Flow
User → Nginx (Registry VM) → Nexus Registry → Docker Swarm
                                            ↓
                                   EmartApp Services (Workers)
                                            ↓
                                   MongoDB/MySQL (Managers)
                                            ↓
                                   CephFS Storage (All Nodes)

### Monitoring & Logging
All Nodes → Node Exporter/cAdvisor → Prometheus → Grafana
All Containers → Fluent-Bit → Elasticsearch → Kibana

### Management
Portainer (Manager1) → Docker Swarm API → All Services

### Registry VM
Separate CentOS VM (<host-ip>) running Nexus + Nginx
Not part of Docker Swarm cluster
Provides private Docker registry for all swarm nodes


### Step 1: Prepare Nodes
```bash
# Provision VMs and install Docker Engine on all nodes
# Option 1: Use Vagrant to create VMs and install Docker Engine
# Option 2: Create VMs manually > Install Linux > Install Docker Engine
```

**Note:** If you want to change Linux distribution, find box on Vagrant Cloud

```bash
# Install MicroCeph on all nodes
sudo snap install microceph --channel=latest/stable
sudo snap refresh --hold microceph
```

**Note:** If using Linux distribution other than Ubuntu, install snapd first

### Step 2: Initialize Docker Swarm
```bash
# On manager1 (first manager node)
docker swarm init --advertise-addr <manager1-ip>
```
**Note:** Save the join tokens

```bash

# On manager2 and manager3
docker swarm join --token <token> <manager1-ip>:2377

# Promote to manager (run on manager1)
docker node promote <manager2-hostname>
docker node promote <manager3-hostname>
```

**Note:** By default, nodes join as workers

```bash
# On worker1 and worker2
docker swarm join --token <token> <manager1-ip>:2377

# Verify cluster
docker node ls
docker system info | grep -A 10 "Swarm:"
```

### Step 3: Setup MicroCeph Cluster
```bash
# On manager1 - Bootstrap MicroCeph cluster
sudo microceph cluster bootstrap
sudo microceph status
```
**Note:** Use --public-network, --cluster-network, or --microceph-ip options to specify a specific interface

```bash
# Add disks to Ceph (example with /dev/sdb)
sudo lsblk
sudo microceph disk add /dev/sdb /dev/sdc --wipe

# Get join token on manager1
sudo microceph cluster add manager2
sudo microceph cluster add manager3
sudo microceph cluster add worker1
sudo microceph cluster add worker2

# On each additional node (manager2, manager3, worker1, worker2)
sudo microceph cluster join <join-token>
# Add disks to Ceph (example with /dev/sdb)
sudo lsblk
sudo microceph disk add /dev/sdb /dev/sdc --wipe

# Verify MicroCeph cluster
sudo microceph status
sudo ceph status
sudo ceph osd tree
```

### Step 4: Create CephFS
```bash
# Create OSD pools and CephFS storage
sudo ceph osd pool create cephfs_data 64
sudo ceph osd pool create cephfs_metadata 64
sudo ceph fs new cephfs cephfs_metadata cephfs_data
sudo ceph fs ls
```

### Step 5: Mount CephFS on All Nodes
```bash
# Create mount point
sudo mkdir -p /mnt/cephfs

# Get admin secret key
sudo ceph auth get-key client.admin

# Add to /etc/fstab
sudo vim /etc/fstab
# Add this line:
<manager1-ip>:6789,<manager2-ip>:6789,<manager3-ip>:6789,<worker1-ip>:6789,<worker2-ip>:6789:/ /mnt/cephfs ceph name=admin,secret=<your-secret-key>,_netdev 0 0

# Mount filesystem
sudo mount -a
sudo systemctl daemon-reload

# Verify mount
df -h | grep cephfs
ls -la /mnt/cephfs
```

### Step 6: Prepare Application Directories
```bash
# On any node (will be available on all nodes via CephFS)
sudo mkdir -p /mnt/cephfs/mongodb/data
sudo mkdir -p /mnt/cephfs/mysqldb/data
sudo chown -R 999:999 /mnt/cephfs/mongodb/data
sudo chown -R 999:999 /mnt/cephfs/mysqldb/data
```

### MicroCeph Advantages
- Simplified Ceph deployment and management
- Automatic cluster formation and scaling
- Built-in monitoring and health checks
- Easy disk addition and removal
- Integrated with snap for easy updates
- Minimal configuration required
- Self-healing and fault-tolerant storage

### CephFS Benefits for Docker Swarm
- Shared storage accessible from all nodes
- Persistent volumes survive node failures
- Automatic replication and data protection
- High performance distributed filesystem
- Seamless scaling as cluster grows
- POSIX-compliant filesystem interface
- Built-in snapshots and backup capabilities

### Monitoring and Maintenance
```bash
# Check cluster health
sudo ceph health
sudo microceph status

# Monitor storage usage
sudo ceph df
sudo ceph osd df

# Check filesystem usage
df -h /mnt/cephfs

# View cluster topology
sudo ceph osd tree

# Check MDS (Metadata Server) status
sudo ceph mds stat

# Monitor performance
sudo ceph osd perf
sudo ceph mds perf dump
```

### Security Considerations
- CephFS provides built-in encryption at rest
- Network traffic between Ceph nodes is authenticated
- Access control through Ceph authentication system
- Regular security updates via snap packages
- Firewall rules for Ceph ports (6789, 6800-7300)


## 2. Portainer - Container Management

### Portainer Overview
- Web-based container management UI
- Manages Docker Swarm clusters
- Provides visual interface for stacks, services, containers
- Role-based access control (RBAC)
- Real-time monitoring and logs

### Install Portainer on Swarm
```bash
# Download Portainer stack file
curl -L https://downloads.portainer.io/ce-lts/portainer-agent-stack.yml -o portainer-agent-stack.yml

# Create Portainer data directory
mkdir -p /mnt/cephfs/portainer_data

# Deploy Portainer stack
docker stack deploy -c portainer-agent-stack.yml portainer

NB: Adjust network and volume settings in portainer-agent-stack.yml as needed for your cluster 

# Verify Portainer deployment
docker service ls | grep portainer
docker service ps portainer

# Access Portainer web UI
https://<manager-node-ip>:9443

# Initial setup:
# 1. Create admin user and password
# 2. Select "Docker Swarm" environment
# 3. Connect to local Swarm cluster
```
### Portainer Features
- Stack deployment and management
- Service scaling and updates
- Container logs and console access
- Network and volume management
- Image management and registry integration
- User and team management
- Webhook notifications

## 3. Monitoring Stack - Prometheus, Grafana, Node Exporter, cAdvisor
### Monitoring Overview
- Prometheus: Metrics collection and storage
- Grafana: Visualization and dashboards
- Node Exporter: Host-level metrics (CPU, memory, disk, network)
- cAdvisor: Container-level metrics (per container resource usage)

### Deploy Monitoring Stack via Portainer UI
To install monitoring for Docker Swarm using Portainer UI, explore the link:
[Docker Swarm Monitoring Tools](https://www.portainer.io/blog/docker-swarm-monitoring-tools)
### Monitoring Metrics
- Node Exporter: CPU, memory, disk, network per host
- cAdvisor: CPU, memory, network, filesystem per container
- Docker Swarm: Service replicas, task states, node status

## 4. Logging Stack - EFK (Elasticsearch, Fluent-Bit, Kibana)
### Logging Overview
- Elasticsearch: Log storage and search engine
- Fluent-Bit: Lightweight log collection and forwarding
- Kibana: Log visualization and analysis

### Deploy EFK Stack on Docker Swarm
```bash
# Navigate to z_efk-docker directory
cd z_efk-docker
ls

# Review and adjust configuration files:
# - compose.yml: EFK stack definition
# - conf/fluent-bit.conf: Fluent-Bit configuration
# - conf/parsers.conf: parser configuration
# - elasticsearch settings: Adjust memory and storage

# Deploy via CLI:
docker stack deploy -c docker-compose.yml efk

# Access Kibana UI:
http://<manager-ip>:5601
NB: Refer to z_efk-docker directory for complete configuration and deployment files
```
### EFK Features
- Centralized log aggregation from all containers
- Real-time log streaming and analysis
- Full-text search across all logs
- Custom dashboards and visualizations
- Log retention and archiving
- Alert on log patterns

## 5. Private Registry Architecture (Nexus + Nginx)
### Registry Setup Details
- Frontend: Nginx reverse proxy with SSL/TLS termination
- Backend: Nexus Repository Manager (Docker registry format)
- URL: https://<host-ip> (HTTPS only)
- Authentication: Nexus user management system
- SSL Certificates: Proper TLS configuration for secure access

### Install Nexus Repository Manager
```bash
# Navigate to z_nexus directory
cd z_nexus

# Run nexus.sh installation script
chmod +x nexus.sh
./nexus.sh

# The script will:
# - Install Java (OpenJDK)
# - Download and install Nexus Repository Manager
# - Configure Nexus as systemd service
# - Start Nexus service

# Verify Nexus installation
sudo systemctl status nexus

# Access Nexus web UI
http://<host-ip>:8081

# Get initial admin password
sudo cat /opt/sonatype-work/nexus3/admin.password

# Configure Docker repositories in Nexus UI:
# 1. Login with admin credentials
# 2. Create Docker (hosted) repository - Port: 8443
# 3. Create Docker (proxy) repository - Port: 8009
# 4. Create Docker (group) repository - Port: 8008
# 5. Enable Docker Bearer Token Realm in Security settings and Push to Top, unless the docker login will fail
```

### Nginx Configuration for Registry
```bash
# Copy nexus.conf to nginx configuration directory
sudo cp nexus.conf /etc/nginx/conf.d/nexus.conf

# Reload Nginx
sudo nginx -t && sudo systemctl reload nginx

NB: Refer to z_nexus directory for nexus.sh and nexus.conf files

### Configure Docker for Private Registry
# Configure Docker daemon for HTTPS registry on all nodes
vim /etc/docker/daemon.json
{
  "registry-mirrors": ["https://<host-ip>"],
  "insecure-registries": []
}

# Restart Docker on all nodes
sudo systemctl restart docker

# Login to private registry (required for push/pull)
docker login https://<host-ip>
# Username: <nexus-username>
# Password: <nexus-password>

# Verify registry access
docker info | grep -A 5 "Registry Mirrors"
cat ~/.docker/config.json

### SELinux Configuration (RHEL/CentOS)
# Install semanage if not available
sudo yum install -y policycoreutils-python-utils  # RHEL/CentOS 8+
sudo yum install -y policycoreutils-python         # RHEL/CentOS 7

# Option 1: Allow specific ports in SELinux
sudo semanage port -a -t http_port_t -p tcp <port>

# Verify ports added
sudo semanage port -l | grep http_port_t

# Allow Nginx to make network connections
sudo setsebool -P httpd_can_network_connect 1

# Option 2: Disable SELinux (not recommended for production)
# Temporary disable (until reboot)
sudo setenforce 0

# Permanent disable
sudo vim /etc/selinux/config
# Change: SELINUX=enforcing to SELINUX=disabled
# Reboot required: sudo reboot

# Check SELinux status
getenforce
sestatus

NB: The Nexus configuration is Port based
  : If you only have Linux machines you can use path based, but Windows machines don't support push/pull in path based nexus configuration
  : For RHEL/CentOS, configure SELinux as shown above
  : Refer to z_nexus directory for complete installation and configuration files
```
### Nexus Repository Configuration
- Repository Type: Docker (hosted), Docker (Proxy) and Docker (group)
- Docker Registry API: v2
- Blob Store: File system or S3-compatible storage
- Security: LDAP/Local user authentication
- Cleanup Policies: Automated image cleanup and retention

### Registry Operations
```bash
# Build and tag for HTTPS registry (Port 443)
docker build -t emartapp-client:latest ./client
docker tag emartapp-client:latest <host-ip>:443/emartapp-client:latest
docker build -t emartapp-api:latest ./nodeapi
docker tag emartapp-api:latest <host-ip>:443/emartapp-api:latest
docker build -t emartapp-webapi:latest ./javaapi
docker tag emartapp-webapi:latest <host-ip>:443/emartapp-webapi:latest

# Push to HTTPS registry (Port 443)
docker push <host-ip>:443/emartapp-client:latest
docker push <host-ip>:443/emartapp-api:latest
docker push <host-ip>:443/emartapp-webapi:latest

# Pull images through Docker proxy (Port 488 via Nginx → Nexus 8009)
# The proxy automatically caches images from Docker Hub
docker pull <host-ip>:488/nginx:latest
docker pull <host-ip>:488/mysql:8.0.33
docker pull <host-ip>:488/mongo:4

# Pull from Docker group registry (Port 8008)
# Combines hosted and proxy repositories
docker pull <host-ip>:8008/emartapp-client:latest
docker pull <host-ip>:8008/library/nginx:latest
```

### Swarm Deployment with HTTPS Registry
```bash
# Deploy stack with registry authentication
docker stack deploy -c emart-stack.yml emart --with-registry-auth

# The --with-registry-auth flag ensures:
# - Registry credentials are distributed to all swarm nodes
# - Secure image pulls during service creation/updates
# - Proper authentication for private image access
```

### Advantages of Nexus + Nginx Setup
- Enterprise-grade repository management
- Multiple repository formats (Docker, Maven, npm, etc.)
- Advanced security and access controls
- High availability and clustering support
- Comprehensive audit and compliance features
- Integration with CI/CD pipelines
- Automated cleanup and retention policies
- REST API for automation and monitoring


## 6. SSL Certificate Generation and Trust Setup
```bash
### Step 1: Create Root Certificate Authority (CA)
# Create CA directory structure
mkdir -p /etc/ssl/ca/{certs,crl,newcerts,private}
chmod 700 /etc/ssl/ca/private
echo 1000 > /etc/ssl/ca/serial
touch /etc/ssl/ca/index.txt

# Generate CA private key
openssl genrsa -aes256 -out /etc/ssl/ca/private/ca-key.pem 4096
chmod 400 /etc/ssl/ca/private/ca-key.pem

# Create CA certificate
openssl req -new -x509 -days 3650 -key /etc/ssl/ca/private/ca-key.pem -sha256 -out /etc/ssl/ca/certs/ca-cert.pem -subj "/C=US/ST=State/L=City/O=Organization/OU=IT Department/CN=Registry CA"

### Step 2: Generate Server Certificate for Registry
# Generate server private key
openssl genrsa -out /etc/ssl/certs/registry-key.pem 4096

# Create certificate signing request (CSR)
openssl req -subj "/C=US/ST=State/L=City/O=Organization/OU=IT Department/CN=<host-ip>" -sha256 -new -key /etc/ssl/certs/registry-key.pem -out /tmp/registry.csr

# Create extensions file for SAN (Subject Alternative Names)
cat > /tmp/registry-extensions.cnf << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = registry.local
DNS.2 = localhost
IP.1 = <host-ip>
IP.2 = 127.0.0.1
EOF

# Sign the certificate with CA
openssl x509 -req -days 365 -in /tmp/registry.csr -CA /etc/ssl/ca/certs/ca-cert.pem -CAkey /etc/ssl/ca/private/ca-key.pem -out /etc/ssl/certs/registry-cert.pem -extensions v3_req -extfile /tmp/registry-extensions.cnf

# Set proper permissions
chmod 444 /etc/ssl/certs/registry-cert.pem
chmod 400 /etc/ssl/certs/registry-key.pem

# Clean up temporary files
rm /tmp/registry.csr /tmp/registry-extensions.cnf

### Step 3: Install CA Certificate on All Nodes
# Copy CA certificate to all swarm nodes
scp /etc/ssl/ca/certs/ca-cert.pem user@<node>:/tmp/  


# On each node - Install CA certificate
sudo cp /tmp/ca-cert.pem /usr/local/share/ca-certificates/registry-ca.crt #Ubuntu
sudo cp /tmp/ca-cert.pem /etc/pki/ca-trust/source/anchors/registry-ca.crt #CentOS

# Update certificate store
sudo update-ca-certificates #Ubuntu
sudo update-ca-trust #CentOS

# Verify CA installation
ls -la /etc/ssl/certs/ | grep registry-ca

# Restart Docker daemon
sudo systemctl restart docker

# Test with curl
curl -I https://<host-ip>


### Step 4: Verify SSL Certificate Setup
# Test certificate chain
openssl s_client -connect <host-ip>:443 -servername <host-ip> -showcerts

# Verify certificate details
openssl x509 -in /etc/ssl/certs/registry-cert.pem -text -noout

# Test Docker registry access
docker login <host-ip>

# Test image pull/push
docker pull hello-world
docker tag hello-world <host-ip>/hello-world:test
docker push <host-ip>/hello-world:test

### Certificate Validation Commands
# Check certificate expiration
openssl x509 -in /etc/ssl/certs/registry-cert.pem -noout -dates

# Verify certificate against CA
openssl verify -CAfile /etc/ssl/ca/certs/ca-cert.pem /etc/ssl/certs/registry-cert.pem

# Check certificate subject and SAN
openssl x509 -in /etc/ssl/certs/registry-cert.pem -noout -subject -ext subjectAltName

# Test SSL connection
openssl s_client -connect <host-ip>:443 -verify_return_error
```
### Security Best Practices
- Use strong passwords for CA private key
- Store CA private key securely (offline if possible)
- Set appropriate file permissions (400 for private keys)
- Regular certificate rotation (annually)
- Monitor certificate expiration dates
- Use strong SSL/TLS configuration in Nginx
- Enable HSTS and security headers
- Regular security audits of certificate infrastructure

## 7. Microservice - Docker Containerization
### Project Overview
Multi-service e-commerce application with Angular frontend, Node.js API, Java API, MongoDB, MySQL, and Nginx reverse proxy.

### Architecture
- Angular Client (Port 4200) - Frontend UI
- Node.js API (Port 5000) - User/shop operations, connects to MongoDB
- Java API (Port 9000) - Books management, connects to MySQL
- Nginx (Port 80) - Reverse proxy and load balancer
- MongoDB (Port 27017) - User data storage
- MySQL (Port 3306) - Books data storage
- Custom Docker network: emart-network

### Routing Configuration
- http://localhost/ → Angular client
- http://localhost/api/ → Node.js API
- http://localhost/webapi/ → Java API

### Dockerfile Optimizations
1. Client Dockerfile:
   - Multi-stage build with nginx
   - Copies Angular dist files to nginx html directory

2. Node.js API Dockerfile:
   - Optimized from 1.38GB to ~150MB using node:14-alpine
   - Multi-stage build for smaller image size
   - Removed static file serving (pure API)

3. Java API Dockerfile:
   - Uses eclipse-temurin:8-jdk for build, eclipse-temurin:8-jre for runtime
   - Fixed hadolint warnings
   - Builds JAR file with Spring Boot

### Nginx Configuration
- Reverse proxy with upstreams for each service
- Security headers and rate limiting
- Proper API path forwarding
- Fixed proxy routing issues

### Environment Variables (.env)
- MYSQL_ROOT_PASSWORD=emartdbpass
- MYSQL_DATABASE=books
- MONGO_INITDB_DATABASE=emartdb
- NODE_ENV=production
- JAVA_OPTS=-Xmx512m

### Key Files Modified
1. docker-compose.yaml - Service orchestration with health checks
2. nginx/default.conf - Reverse proxy configuration
3. client/Dockerfile - Angular build optimization
4. nodeapi/Dockerfile - Node.js optimization
5. javaapi/Dockerfile - Java build optimization
6. .env - Environment variables
7. client/src/app/backend_config/backend-config.service.ts - Dynamic backend URLs
8. javaapi/src/main/resources/application.properties - Database configuration
9. nodeapi/server.js - MongoDB connection with environment variables

### Testing Results
- All services start successfully
- Health checks pass for all services
- API endpoints accessible through nginx proxy
- Database connections working
- Application accessible at http://localhost

### Access Patterns
✅ CORRECT: http://localhost (through nginx proxy)
❌ INCORRECT: http://localhost:4200 (bypasses proxy, API communication issues)

### Troubleshooting Notes
- Use nginx proxy (port 80) for full application access
- Direct service access (ports 4200, 5000, 9000) bypasses proxy architecture
- Health checks ensure service readiness before dependencies start
- Environment variables provide flexible configuration

### Commands for Deployment
1. Build and start: docker compose up --build
2. Start services: docker compose up -d
3. Check status: docker compose ps
4. View logs: docker compose logs [service_name]
5. Stop services: docker compose down
6. Rebuild specific service: docker compose build [service_name] --no-cache

### Performance Optimizations
- Alpine-based images for smaller size
- Multi-stage builds
- Persistent volumes for data
- Health checks for reliability
- Custom network for service communication
- Environment-based configuration

### Security Improvements
- Externalized database credentials
- Security headers in nginx
- Rate limiting
- No hardcoded passwords in code


## 8. Docker Swarm Deployment Procedure
```bash
### Step 1: Build and Push Images to Private Registry
# Build images locally using docker-compose
docker compose build

# Tag images for private registry
docker tag emartapp-client:latest <host-ip>/emartapp-client:latest
docker tag emartapp-nodeapi:latest <host-ip>/emartapp-api:latest
docker tag emartapp-javaapi:latest <host-ip>/emartapp-webapi:latest
docker tag mongo:4 <host-ip>/mongo:4
docker tag mysql:8.0.33 <host-ip>/mysql:8.0.33
docker tag nginx:1.21 <host-ip>/nginx:1.21

# Push images to private registry
docker push <host-ip>/emartapp-client:latest
docker push <host-ip>/emartapp-api:latest
docker push <host-ip>/emartapp-webapi:latest
docker push <host-ip>/mongo:4
docker push <host-ip>/mysql:8.0.33
docker push <host-ip>/nginx:1.21

### Step 2: Prepare Swarm Environment
# Create Persistance Volume for Databases
sudo mkdir -p /mnt/cephfs/mongodb/data
sudo mkdir -p /mnt/cephfs/mysqldb/data
sudo chown -R 999:999 /mnt/cephfs/mongodb/data
sudo chown -R 999:999 /mnt/cephfs/mysqldb/data

### Step 3: Create Docker Secrets
# Create MySQL password secret
echo "emartdbpass" | docker secret create mysql_password -
docker secret ls

### Step 4: Create Docker Configs
# Create nginx configuration
docker config create nginx_config ./nginx/default.conf
docker config ls

### Step 5: Deploy Stack
# Deploy the stack with registry authentication
docker stack deploy -c emart-stack.yml emart --with-registry-auth
# Note: --with-registry-auth is required for private registry access

### Step 6: Verify Deployment
# Check stack services
docker stack ls
docker stack services emart
docker stack ps emart
docker service ls

# Check service status
docker service ps emart_api
docker service ps emart_webapi
docker service ps emart_emongo
docker service ps emart_mysqldb
docker service ps emart_client
docker service ps emart_nginx

# View service logs
docker service logs emart_api --tail 20
docker service logs emart_webapi --tail 20
docker service logs emart_emongo --tail 20
docker service logs emart_mysqldb --tail 20

### Step 7: Access Application
# Application accessible through any node in the swarm
http://<any-node-ip>:80

### Troubleshooting Commands
# Force update a service (useful for network issues)
docker service update --force <service>
docker service scale <service>=5
# Remove and redeploy stack
docker stack rm emart
docker stack deploy -c emart-stack.yml emart --with-registry-auth
```
### Stack File Configuration (emart-stack.yml)
Key differences from docker-compose.yaml:
- Uses overlay networks for multi-node communication
- Implements placement constraints for databases (manager nodes only)
- Uses Docker secrets for sensitive data
- Uses Docker configs for nginx configuration
- Includes replica counts and update strategies
- Health checks adapted for swarm (wget for Node.js, curl for Java)
- Volume mounts use shared storage paths
