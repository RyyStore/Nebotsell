#!/bin/bash

# Colors
green="\e[38;5;82m"
red="\e[38;5;196m"
yellow="\e[38;5;226m"
blue="\e[38;5;27m"
neutral="\e[0m"

# Instal dan jalankan Redis
echo -e "${yellow}Installing Redis...${neutral}"
sudo apt update && sudo apt install -y redis-server

echo -e "${yellow}Starting Redis...${neutral}"
sudo systemctl start redis
sudo systemctl enable redis

# Tunggu sampai Redis benar-benar berjalan
until systemctl is-active --quiet redis; do
    echo -e "${red}Waiting for Redis to start...${neutral}"
    sleep 2
done
echo -e "${green}Redis is running.${neutral}"

# Instal Bull
install_bull() {
    if npm list -g bull &> /dev/null; then
        echo -e "${green}Bull is already installed.${neutral}"
    else
        echo -e "${yellow}Installing Bull...${neutral}"
        npm install -g bull
        echo -e "${green}Bull installed successfully.${neutral}"
    fi
}

# Menjalankan setup queue
setup_queue() {
    echo -e "${blue}Setting up queue for top-up processing...${neutral}"
    install_bull
    echo -e "${green}✅ Queue setup completed.${neutral}"
}

setup_queue
