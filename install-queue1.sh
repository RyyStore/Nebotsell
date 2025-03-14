#!/data/data/com.termux/files/usr/bin/bash

# Colors
green="\e[38;5;82m"
red="\e[38;5;196m"
neutral="\e[0m"

# Fungsi untuk memeriksa status Redis
check_redis_status() {
    if systemctl is-active --quiet redis; then
        echo -e "${green}Redis is running.${neutral}"
    else
        echo -e "${red}Redis is not running. Starting Redis...${neutral}"
        sudo systemctl start redis
        sudo systemctl enable redis
    fi
}

# Fungsi untuk memeriksa dan menginstal Bull
install_bull() {
    if npm list bull | grep -q "bull"; then
        echo -e "${green}Bull is already installed.${neutral}"
    else
        echo -e "${yellow}Installing Bull...${neutral}"
        npm install bull
        echo -e "${green}Bull installed successfully.${neutral}"
    fi
}

# Fungsi utama
setup_queue() {
    echo -e "${blue}Setting up queue for top-up processing...${neutral}"

    # Periksa dan jalankan Redis
    check_redis_status

    # Periksa dan instal Bull
    install_bull

    echo -e "${green}✅ Queue setup completed.${neutral}"
}

# Jalankan setup
setup_queue
