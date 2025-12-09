Vagrant.configure("2") do |config|
  config.vm.box = "ubuntu/jammy64"
  config.vm.boot_timeout = 600
  config.hostmanager.enabled = true
  config.hostmanager.manage_host = true

  # Docker installation script
  docker_script = <<-SCRIPT
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg lsb-release
    sudo mkdir -m 0755 -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker vagrant
  SCRIPT

  # Hosts file configuration
  hosts_script = <<-SCRIPT
    cat >> /etc/hosts << EOF
192.168.58.11 manager1
192.168.58.12 manager2
192.168.58.13 manager3
192.168.58.21 worker1
192.168.58.22 worker2
192.168.58.30 registry
EOF
  SCRIPT

  # Manager Nodes (3 VMs with 4096MB RAM)
  (1..3).each do |i|
    config.vm.define "manager#{i}" do |manager|
      manager.vm.hostname = "manager#{i}"
      manager.vm.network "private_network", ip: "192.168.58.1#{i}"
      manager.vm.disk :disk, size: "20GB", name: "manager#{i}_storage1"
      manager.vm.disk :disk, size: "20GB", name: "manager#{i}_storage2"
      manager.vm.provider "virtualbox" do |vb|
        vb.name = "swarm_manager#{i}"
        vb.memory = 6144
        vb.cpus = 2
        vb.gui = false
      end
      manager.vm.provision "shell", inline: docker_script
      manager.vm.provision "shell", inline: hosts_script
    end
  end

  # Worker Nodes (2 VMs with 2048MB RAM)
  (1..2).each do |i|
    config.vm.define "worker#{i}" do |worker|
      worker.vm.hostname = "worker#{i}"
      worker.vm.network "private_network", ip: "192.168.58.2#{i}"
      worker.vm.disk :disk, size: "20GB", name: "worker#{i}_storage1"
      worker.vm.disk :disk, size: "20GB", name: "worker#{i}_storage2"
      worker.vm.provider "virtualbox" do |vb|
        vb.name = "swarm_worker#{i}"
        vb.memory = 2048
        vb.cpus = 1
        vb.gui = false
      end
      worker.vm.provision "shell", inline: docker_script
      worker.vm.provision "shell", inline: hosts_script
    end
  end

  # Registry VM
  config.vm.define "registry" do |registry|
    registry.vm.box = "centos/stream9"
    registry.vm.hostname = "registry"
    registry.vm.network "private_network", ip: "192.168.58.30"
    registry.vm.provider "virtualbox" do |vb|
      vb.name = "swarm_registry"
      vb.memory = 4096
      vb.cpus = 1
      vb.gui = false
    end
    registry.vm.provision "shell", inline: hosts_script
  end
end
