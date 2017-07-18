#!/usr/bin/env ruby

require 'base64'
require 'json'
require 'nokogiri'

if ARGV.length == 0 && $stdin.tty?
  puts "Usage: cat thread.json | ./json_to_html.rb > index.html"
  exit 1
end

ARGF.each_line do |line|

  if File.exist?("indexable_threads/" + line.strip)
    puts line.strip
    next
  end

  thread = JSON.parse(File.read(line.strip))

  def get_part(payload, contentType)
    if payload["headers"] && payload['headers'].find{ |x| x["name"] == "Content-Type" && x["value"] =~ /#{contentType}/i }
      payload

    elsif payload["parts"]
      sub_parts = payload["parts"].map{ |p| get_part(p, contentType) }
      sub_parts.compact.first
    end
  end

  output = {
    thread_id: "",
    date: 0,
    from: [],
    to: [],
    cc: [],
    bcc: [],
    labels: [],
    attachments: [],
    listid: [],
    rfc822msgid: [],
    deliveredto: [],
    replyto: [],
    subject: "",
    body: ""
  }


  thread['messages'].each do |message|
    if message['labelIds']
      message['labelIds'].each do |labelId|
        output[:labels].push(labelId)
      end
    end
    output[:date] = message['internalDate']
    if message['payload'] && message['payload']['headers']
      message['payload']['headers'].each do |header|
        case header['name'].downcase
        when 'to'
          output[:to].push(header['value'])
        when 'from'
          output[:from].push(header['value'])
        when 'cc'
          output[:cc].push(header['value'])
        when 'bcc'
          output[:bcc].push(header['value'])
        when 'reply-to'
          output[:replyto].push(header['value'])
        when 'delivered-to'
          output[:deliveredto].push(header['value'])
        when 'list-id'
          output[:listid].push(header['value'])
        when 'message-id'
          output[:rfc822msgid].push(header['value'])
        when 'subject'
          if output[:subject] == ""
            output[:subject] = header['value']
          end
        end
      end
    end
  end

  output[:thread_id] = thread['id']

  if thread["messages"]
    message = thread["messages"][-1]
  else
    message = thread
  end

  html = get_part(message["payload"], "text/html")
  if html && html['body'] && html['body']['data']
    doc = Nokogiri::HTML(Base64.urlsafe_decode64(html['body']['data']))
    doc.css('script, style, link').each { |node| node.remove }
    output[:body] = doc.css('body').text.gsub(/\s+/, " ")
  else
    text = get_part(message['payload'], 'text/plain')
    if text && text['body'] && text['body']['data']
      output[:body] = Base64.urlsafe_decode64(text['body']['data']).force_encoding('utf-8')
    end
  end

  output[:from].uniq!
  output[:to].uniq!
  output[:cc].uniq!
  output[:bcc].uniq!
  output[:replyto].uniq!
  output[:deliveredto].uniq!
  output[:listid].uniq!
  output[:labels].uniq!

  File.write("indexable_threads/" + output[:thread_id] + ".json", output.to_json(4))
  puts output[:thread_id]
end
